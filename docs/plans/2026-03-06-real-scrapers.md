# Real Scraper Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fake data generator in `ingestion.ts` with real scrapers that pull actual unclaimed property and surplus funds data from state government portals and county websites.

**Architecture:** Scraper modules live in `apps/worker/src/scrapers/`. Each implements a common `Scraper` interface returning `ScrapedOpportunity[]`. The ingestion processor dispatches to the correct scraper by state code. Puppeteer handles SPA sites (CA/OH/NY), `cheerio` handles FL HTML parsing, and direct REST handles the TX Socrata API. County surplus PDFs are downloaded and parsed with `pdf-parse`.

**Tech Stack:** Node 20, TypeScript, Puppeteer (already in deps), Cheerio, pdf-parse, Socrata SODA API, pg_trgm for fuzzy matching.

---

### Task 1: Create scraper types and base class

**Files:**
- Create: `apps/worker/src/scrapers/types.ts`
- Create: `apps/worker/src/scrapers/base.ts`

**Step 1: Create types.ts**

```typescript
// apps/worker/src/scrapers/types.ts
export interface ScrapedOpportunity {
  source_type: 'unclaimed_property' | 'tax_sale_surplus' | 'foreclosure_surplus';
  source_id: string;         // unique ID from the source (e.g., claim number, parcel ID)
  source_url: string;        // URL where this record was found
  state: string;             // 2-letter state code
  county: string | null;
  owner_name: string;
  owner_address: string | null;
  holder_name: string | null;
  property_description: string | null;
  reported_amount: number | null;
  parcel_number: string | null;
  sale_date: string | null;  // ISO date string
  surplus_date: string | null;
  deadline_date: string | null;
  raw_data: Record<string, unknown>; // full original record for audit
}

export interface ScraperConfig {
  state: string;
  minDelayMs: number;    // minimum ms between requests
  maxRetries: number;
  timeoutMs: number;     // per-request timeout
  maxResults: number;    // cap results per scrape run
}

export interface ScraperResult {
  state: string;
  source: string;        // scraper name
  found: number;
  opportunities: ScrapedOpportunity[];
  errors: string[];
  durationMs: number;
}

export interface Scraper {
  readonly name: string;
  readonly config: ScraperConfig;
  scrape(): Promise<ScraperResult>;
  dispose(): Promise<void>;
}
```

**Step 2: Create base.ts with rate limiting and retry logic**

```typescript
// apps/worker/src/scrapers/base.ts
import type { Scraper, ScraperConfig, ScraperResult, ScrapedOpportunity } from './types.js';

export abstract class BaseScraper implements Scraper {
  abstract readonly name: string;
  readonly config: ScraperConfig;
  protected errors: string[] = [];
  private lastRequestTime = 0;

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  abstract scrapeImpl(): Promise<ScrapedOpportunity[]>;

  async scrape(): Promise<ScraperResult> {
    const start = Date.now();
    this.errors = [];
    let opportunities: ScrapedOpportunity[] = [];

    try {
      opportunities = await this.scrapeImpl();
    } catch (err) {
      this.errors.push(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      state: this.config.state,
      source: this.name,
      found: opportunities.length,
      opportunities,
      errors: this.errors,
      durationMs: Date.now() - start,
    };
  }

  async dispose(): Promise<void> {}

  protected async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    const jitter = Math.random() * this.config.minDelayMs * 0.5;
    const wait = this.config.minDelayMs + jitter - elapsed;
    if (wait > 0) {
      await new Promise(r => setTimeout(r, wait));
    }
    this.lastRequestTime = Date.now();
  }

  protected async fetchWithRetry(
    fn: () => Promise<Response>,
    label: string,
  ): Promise<Response> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      await this.throttle();
      try {
        const res = await fn();
        if (res.ok) return res;
        lastErr = new Error(`HTTP ${res.status} for ${label}`);
        this.errors.push(`Attempt ${attempt + 1}: ${lastErr.message}`);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        this.errors.push(`Attempt ${attempt + 1}: ${lastErr.message}`);
      }
      // Exponential backoff: 5s, 15s, 45s
      const backoff = 5000 * Math.pow(3, attempt);
      await new Promise(r => setTimeout(r, backoff));
    }
    throw lastErr ?? new Error(`All ${this.config.maxRetries} retries failed for ${label}`);
  }

  protected log(msg: string): void {
    console.log(`[${this.name}] ${msg}`);
  }
}
```

**Step 3: Commit**

```bash
git add apps/worker/src/scrapers/types.ts apps/worker/src/scrapers/base.ts
git commit -m "feat: add scraper types and base class with rate limiting"
```

---

### Task 2: Build Texas Socrata SODA API scraper

**Files:**
- Create: `apps/worker/src/scrapers/texas-soda.ts`

The Texas Comptroller publishes unclaimed property data on the Socrata Open Data portal at `data.texas.gov`. Dataset ID: `3un9-h9it`. The SODA API returns JSON with SoQL filtering.

**Step 1: Create texas-soda.ts**

```typescript
// apps/worker/src/scrapers/texas-soda.ts
import { BaseScraper } from './base.js';
import type { ScrapedOpportunity, ScraperConfig } from './types.js';

const DATASET_URL = 'https://data.texas.gov/resource/3un9-h9it.json';
const SOURCE_PAGE = 'https://data.texas.gov/Government-and-Taxes/Texas-Unclaimed-Property-Listing/3un9-h9it';

// Socrata SODA API field names (discovered from dataset metadata)
// Common fields: owner_name, property_type, holder_name, reported_value, city, zip_code
// Adjust field names after first successful fetch (stored in raw_data for inspection)

export class TexasSodaScraper extends BaseScraper {
  readonly name = 'texas-soda';
  private appToken: string | undefined;

  constructor(config?: Partial<ScraperConfig>) {
    super({
      state: 'TX',
      minDelayMs: 1000,
      maxRetries: 3,
      timeoutMs: 30_000,
      maxResults: 500,
      ...config,
    });
    this.appToken = process.env.SOCRATA_APP_TOKEN;
  }

  async scrapeImpl(): Promise<ScrapedOpportunity[]> {
    const opportunities: ScrapedOpportunity[] = [];
    const pageSize = 100;
    let offset = 0;

    while (opportunities.length < this.config.maxResults) {
      const params = new URLSearchParams({
        '$limit': String(pageSize),
        '$offset': String(offset),
        '$where': 'reported_value > 500',
        '$order': 'reported_value DESC',
      });

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (this.appToken) {
        headers['X-App-Token'] = this.appToken;
      }

      const url = `${DATASET_URL}?${params}`;
      this.log(`Fetching page at offset ${offset}...`);

      const res = await this.fetchWithRetry(
        () => fetch(url, {
          headers,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        }),
        `SODA offset=${offset}`,
      );

      const records: Record<string, unknown>[] = await res.json() as Record<string, unknown>[];

      if (records.length === 0) break;

      for (const rec of records) {
        const opp = this.mapRecord(rec);
        if (opp) opportunities.push(opp);
      }

      this.log(`Got ${records.length} records (total: ${opportunities.length})`);

      if (records.length < pageSize) break;
      offset += pageSize;
    }

    return opportunities.slice(0, this.config.maxResults);
  }

  private mapRecord(rec: Record<string, unknown>): ScrapedOpportunity | null {
    // Socrata field names vary — try common patterns
    const ownerName = String(rec.owner_name ?? rec.property_owner ?? rec.name ?? '').trim();
    if (!ownerName) return null;

    const amount = parseFloat(String(rec.reported_value ?? rec.cash_reported ?? rec.amount ?? '0'));
    if (isNaN(amount) || amount <= 0) return null;

    // Build a unique source_id from available identifiers
    const sourceId = String(
      rec.up_id ?? rec.property_id ?? rec.id ?? `TX-${ownerName}-${amount}`,
    );

    return {
      source_type: 'unclaimed_property',
      source_id: `TX-SODA-${sourceId}`,
      source_url: SOURCE_PAGE,
      state: 'TX',
      county: rec.county ? String(rec.county) : null,
      owner_name: ownerName,
      owner_address: [rec.address, rec.city, rec.state_code, rec.zip_code]
        .filter(Boolean).map(String).join(', ') || null,
      holder_name: rec.holder_name ? String(rec.holder_name) : null,
      property_description: rec.property_type ? String(rec.property_type) : null,
      reported_amount: amount,
      parcel_number: null,
      sale_date: null,
      surplus_date: null,
      deadline_date: null,
      raw_data: rec,
    };
  }
}
```

**Step 2: Commit**

```bash
git add apps/worker/src/scrapers/texas-soda.ts
git commit -m "feat: add Texas SODA API scraper for unclaimed property"
```

---

### Task 3: Build Florida HTTP form scraper

**Files:**
- Create: `apps/worker/src/scrapers/florida-up.ts`

Florida's unclaimed property search at `fltreasurehunt.gov` uses a Java servlet backend (`ControlServlet`). The new front-end is a React SPA, but the old servlet endpoint may still accept form POSTs. If the servlet is blocked, fall back to Puppeteer to drive the React SPA.

**Step 1: Create florida-up.ts**

```typescript
// apps/worker/src/scrapers/florida-up.ts
import { BaseScraper } from './base.js';
import type { ScrapedOpportunity, ScraperConfig } from './types.js';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

const SEARCH_URL = 'https://www.fltreasurehunt.gov';

// Common Florida surnames to search — rotated each scrape run
const SEARCH_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris',
  'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King',
];

export class FloridaUPScraper extends BaseScraper {
  readonly name = 'florida-up';

  constructor(config?: Partial<ScraperConfig>) {
    super({
      state: 'FL',
      minDelayMs: 3000,
      maxRetries: 3,
      timeoutMs: 60_000,
      maxResults: 200,
      ...config,
    });
  }

  async scrapeImpl(): Promise<ScrapedOpportunity[]> {
    // Use Puppeteer to drive the React SPA
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const opportunities: ScrapedOpportunity[] = [];

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );

      // Pick a subset of names for this run
      const namesToSearch = this.shuffleArray(SEARCH_NAMES).slice(0, 5);

      for (const lastName of namesToSearch) {
        if (opportunities.length >= this.config.maxResults) break;

        try {
          await this.throttle();
          this.log(`Searching FL for last name: ${lastName}`);

          await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: this.config.timeoutMs });

          // Wait for the search form to render
          await page.waitForSelector('input[name="lastName"], input[id*="lastName"], input[placeholder*="Last"]', {
            timeout: 15_000,
          }).catch(() => null);

          // Try to find and fill the search form
          const lastNameInput = await page.$('input[name="lastName"]')
            ?? await page.$('input[id*="lastName"]')
            ?? await page.$('input[placeholder*="Last"]');

          if (!lastNameInput) {
            this.errors.push(`Could not find last name input on FL search page`);
            continue;
          }

          await lastNameInput.click({ clickCount: 3 });
          await lastNameInput.type(lastName, { delay: 50 });

          // Find and click search button
          const searchBtn = await page.$('button[type="submit"]')
            ?? await page.$('button:has-text("Search")')
            ?? await page.$('input[type="submit"]');

          if (searchBtn) {
            await searchBtn.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => null);
            await new Promise(r => setTimeout(r, 3000)); // extra wait for React render
          }

          // Extract results from the rendered page
          const html = await page.content();
          const results = this.parseResults(html, lastName);
          opportunities.push(...results);
          this.log(`Found ${results.length} results for "${lastName}" (total: ${opportunities.length})`);
        } catch (err) {
          this.errors.push(`FL search for "${lastName}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      await browser.close();
    }

    return opportunities.slice(0, this.config.maxResults);
  }

  private parseResults(html: string, searchLastName: string): ScrapedOpportunity[] {
    const $ = cheerio.load(html);
    const results: ScrapedOpportunity[] = [];

    // Look for table rows or list items containing results
    // The exact selectors depend on the site's HTML structure
    $('table tbody tr, .search-result, .result-item, [class*="result"]').each((_, el) => {
      const cells = $(el).find('td');
      const text = $(el).text();

      if (cells.length >= 3) {
        // Table-based results
        const ownerName = $(cells[0]).text().trim();
        const holderName = $(cells[1]).text().trim();
        const amountText = $(cells[2]).text().trim().replace(/[$,]/g, '');
        const amount = parseFloat(amountText);

        if (ownerName && !isNaN(amount) && amount > 0) {
          results.push({
            source_type: 'unclaimed_property',
            source_id: `FL-UP-${ownerName.replace(/\s+/g, '-')}-${amount}`,
            source_url: SEARCH_URL,
            state: 'FL',
            county: null,
            owner_name: ownerName,
            owner_address: null,
            holder_name: holderName || null,
            property_description: $(cells[3])?.text().trim() || null,
            reported_amount: amount,
            parcel_number: null,
            sale_date: null,
            surplus_date: null,
            deadline_date: null,
            raw_data: {
              search_name: searchLastName,
              cells: cells.map((_, c) => $(c).text().trim()).get(),
              scraped_at: new Date().toISOString(),
            },
          });
        }
      }
    });

    // Also try to extract from any JSON data embedded in the page
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const content = $(script).html() || '';
      const jsonMatch = content.match(/"results"\s*:\s*(\[[\s\S]*?\])/);
      if (jsonMatch) {
        try {
          const records = JSON.parse(jsonMatch[1]) as Record<string, unknown>[];
          for (const rec of records) {
            const name = String(rec.ownerName ?? rec.owner ?? '').trim();
            const amt = parseFloat(String(rec.amount ?? rec.reportedValue ?? '0'));
            if (name && !isNaN(amt) && amt > 0) {
              results.push({
                source_type: 'unclaimed_property',
                source_id: `FL-UP-${String(rec.id ?? rec.propertyId ?? `${name}-${amt}`)}`,
                source_url: SEARCH_URL,
                state: 'FL',
                county: rec.county ? String(rec.county) : null,
                owner_name: name,
                owner_address: rec.address ? String(rec.address) : null,
                holder_name: rec.holderName ? String(rec.holderName) : null,
                property_description: rec.propertyType ? String(rec.propertyType) : null,
                reported_amount: amt,
                parcel_number: null,
                sale_date: null,
                surplus_date: null,
                deadline_date: null,
                raw_data: { ...rec, search_name: searchLastName, scraped_at: new Date().toISOString() },
              });
            }
          }
        } catch { /* ignore parse errors */ }
      }
    }

    return results;
  }

  private shuffleArray<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
```

**Step 2: Commit**

```bash
git add apps/worker/src/scrapers/florida-up.ts
git commit -m "feat: add Florida unclaimed property Puppeteer scraper"
```

---

### Task 4: Build California / Ohio / New York Puppeteer scrapers

**Files:**
- Create: `apps/worker/src/scrapers/california-up.ts`
- Create: `apps/worker/src/scrapers/ohio-up.ts`
- Create: `apps/worker/src/scrapers/newyork-up.ts`

All three use the same Puppeteer pattern: navigate to search page, fill form, extract results.

**Step 1: Create california-up.ts**

```typescript
// apps/worker/src/scrapers/california-up.ts
import { BaseScraper } from './base.js';
import type { ScrapedOpportunity, ScraperConfig } from './types.js';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

const SEARCH_URL = 'https://claimit.ca.gov';

const SEARCH_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Lopez', 'Wilson', 'Anderson',
  'Lee', 'Nguyen', 'Kim', 'Chen', 'Wang', 'Patel', 'Singh',
];

export class CaliforniaUPScraper extends BaseScraper {
  readonly name = 'california-up';

  constructor(config?: Partial<ScraperConfig>) {
    super({
      state: 'CA',
      minDelayMs: 5000,
      maxRetries: 3,
      timeoutMs: 60_000,
      maxResults: 200,
      ...config,
    });
  }

  async scrapeImpl(): Promise<ScrapedOpportunity[]> {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const opportunities: ScrapedOpportunity[] = [];

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      );

      const namesToSearch = this.shuffleArray(SEARCH_NAMES).slice(0, 4);

      for (const lastName of namesToSearch) {
        if (opportunities.length >= this.config.maxResults) break;

        try {
          await this.throttle();
          this.log(`Searching CA for: ${lastName}`);

          await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: this.config.timeoutMs });
          await new Promise(r => setTimeout(r, 3000));

          // Find search input — try common selectors
          const input = await page.$('input[name="lastName"]')
            ?? await page.$('input[id*="last"]')
            ?? await page.$('input[placeholder*="Last"]')
            ?? await page.$('input[type="text"]');

          if (!input) {
            this.errors.push('CA: Could not find search input');
            continue;
          }

          await input.click({ clickCount: 3 });
          await input.type(lastName, { delay: 50 });

          const btn = await page.$('button[type="submit"]')
            ?? await page.$('button:has-text("Search")')
            ?? await page.$('input[type="submit"]');

          if (btn) {
            await btn.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => null);
            await new Promise(r => setTimeout(r, 3000));
          }

          const html = await page.content();
          const results = this.parseResults(html, lastName);
          opportunities.push(...results);
          this.log(`CA: ${results.length} results for "${lastName}"`);
        } catch (err) {
          this.errors.push(`CA "${lastName}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      await browser.close();
    }

    return opportunities.slice(0, this.config.maxResults);
  }

  private parseResults(html: string, searchName: string): ScrapedOpportunity[] {
    const $ = cheerio.load(html);
    const results: ScrapedOpportunity[] = [];

    $('table tbody tr, .search-result, [class*="result"]').each((_, el) => {
      const cells = $(el).find('td');
      if (cells.length >= 2) {
        const name = $(cells[0]).text().trim();
        const amountText = $(cells).last().text().trim().replace(/[$,]/g, '');
        const amount = parseFloat(amountText);

        if (name && !isNaN(amount) && amount > 0) {
          results.push({
            source_type: 'unclaimed_property',
            source_id: `CA-UP-${name.replace(/\s+/g, '-')}-${amount}`,
            source_url: SEARCH_URL,
            state: 'CA',
            county: null,
            owner_name: name,
            owner_address: null,
            holder_name: cells.length > 2 ? $(cells[1]).text().trim() || null : null,
            property_description: cells.length > 3 ? $(cells[2]).text().trim() || null : null,
            reported_amount: amount,
            parcel_number: null,
            sale_date: null,
            surplus_date: null,
            deadline_date: null,
            raw_data: { cells: cells.map((_, c) => $(c).text().trim()).get(), search_name: searchName, scraped_at: new Date().toISOString() },
          });
        }
      }
    });

    return results;
  }

  private shuffleArray<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
```

**Step 2: Create ohio-up.ts and newyork-up.ts**

Same pattern as California but with state-specific URLs and selectors:

- Ohio: `https://unclaimed.ohio.gov/search`
- New York: `https://ouf.osc.ny.gov/ouf/`

(Both follow identical Puppeteer pattern — navigate, fill, extract. Adjust search URL and source_id prefix.)

**Step 3: Commit**

```bash
git add apps/worker/src/scrapers/california-up.ts apps/worker/src/scrapers/ohio-up.ts apps/worker/src/scrapers/newyork-up.ts
git commit -m "feat: add CA/OH/NY Puppeteer scrapers for unclaimed property"
```

---

### Task 5: Build county tax sale surplus PDF scraper

**Files:**
- Create: `apps/worker/src/scrapers/county-surplus.ts`

County clerks and treasurers publish PDF lists of excess proceeds from tax sales. Known URLs:
- LA County: `ttc.lacounty.gov/wp-content/uploads/YYYY/MM/YYYYA-Sold-Parcels-...pdf`
- Miami-Dade: Clerk of Court surplus list
- Harris County TX: County Treasurer surplus list

**Step 1: Create county-surplus.ts**

```typescript
// apps/worker/src/scrapers/county-surplus.ts
import { BaseScraper } from './base.js';
import type { ScrapedOpportunity, ScraperConfig } from './types.js';
import pdf from 'pdf-parse';

interface CountyPDFSource {
  state: string;
  county: string;
  urls: string[];            // try in order until one works
  sourceType: 'tax_sale_surplus' | 'foreclosure_surplus';
  holderName: string;
}

const COUNTY_SOURCES: CountyPDFSource[] = [
  {
    state: 'CA',
    county: 'Los Angeles',
    urls: [
      `https://ttc.lacounty.gov/wp-content/uploads/${new Date().getFullYear()}/08/${new Date().getFullYear()}A-Sold-Parcels-Puchase-Price-and-Excess-Proceeds.pdf`,
      `https://ttc.lacounty.gov/wp-content/uploads/${new Date().getFullYear() - 1}/08/${new Date().getFullYear() - 1}A-Sold-Parcels-Puchase-Price-and-Excess-Proceeds.pdf`,
    ],
    sourceType: 'tax_sale_surplus',
    holderName: 'LA County Treasurer and Tax Collector',
  },
  {
    state: 'FL',
    county: 'Miami-Dade',
    urls: [
      'https://www.miamidade.gov/global/service.page?Mduid_service=ser1578596498879598',
    ],
    sourceType: 'foreclosure_surplus',
    holderName: 'Miami-Dade County Clerk of Court',
  },
  {
    state: 'TX',
    county: 'Harris',
    urls: [
      'https://www.hctx.net/HarrisCounty/ExcessProceeds',
    ],
    sourceType: 'tax_sale_surplus',
    holderName: 'Harris County Tax Assessor-Collector',
  },
];

export class CountySurplusScraper extends BaseScraper {
  readonly name = 'county-surplus';
  private targetState: string;

  constructor(state: string, config?: Partial<ScraperConfig>) {
    super({
      state,
      minDelayMs: 2000,
      maxRetries: 3,
      timeoutMs: 60_000,
      maxResults: 300,
      ...config,
    });
    this.targetState = state;
  }

  async scrapeImpl(): Promise<ScrapedOpportunity[]> {
    const sources = COUNTY_SOURCES.filter(s => s.state === this.targetState);
    const opportunities: ScrapedOpportunity[] = [];

    for (const source of sources) {
      try {
        const results = await this.scrapeCounty(source);
        opportunities.push(...results);
      } catch (err) {
        this.errors.push(`${source.county}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return opportunities.slice(0, this.config.maxResults);
  }

  private async scrapeCounty(source: CountyPDFSource): Promise<ScrapedOpportunity[]> {
    for (const url of source.urls) {
      try {
        this.log(`Fetching PDF: ${url}`);
        const res = await this.fetchWithRetry(
          () => fetch(url, {
            signal: AbortSignal.timeout(this.config.timeoutMs),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurplusFlow/1.0)' },
          }),
          `PDF ${source.county}`,
        );

        const contentType = res.headers.get('content-type') || '';

        if (contentType.includes('pdf')) {
          const buffer = Buffer.from(await res.arrayBuffer());
          return this.parsePDF(buffer, source, url);
        }

        // If HTML page, try to find PDF links
        if (contentType.includes('html')) {
          const html = await res.text();
          return this.parseHTMLForSurplus(html, source, url);
        }
      } catch (err) {
        this.errors.push(`PDF ${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return [];
  }

  private async parsePDF(buffer: Buffer, source: CountyPDFSource, url: string): Promise<ScrapedOpportunity[]> {
    const data = await pdf(buffer);
    const lines = data.text.split('\n').map(l => l.trim()).filter(Boolean);
    const results: ScrapedOpportunity[] = [];

    // Common PDF patterns for surplus funds:
    // Parcel#   Owner Name   Sale Price   Excess Amount
    // or:
    // Item#  Parcel  Owner  Amount

    for (const line of lines) {
      // Try to match lines with dollar amounts
      const amountMatch = line.match(/\$?([\d,]+\.?\d{0,2})\s*$/);
      if (!amountMatch) continue;

      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      if (isNaN(amount) || amount < 100) continue;

      // Try to extract parcel number (common formats: 1234-567-890, 12345678)
      const parcelMatch = line.match(/(\d{2,4}[-]\d{2,4}[-]\d{2,4}[-]?\d{0,4})/);

      // Extract owner name — everything between parcel and amount
      const textBeforeAmount = line.replace(amountMatch[0], '').trim();
      const nameText = parcelMatch
        ? textBeforeAmount.replace(parcelMatch[0], '').trim()
        : textBeforeAmount;

      // Clean up — remove item numbers, dates, etc.
      const ownerName = nameText
        .replace(/^\d+\s+/, '')          // leading item number
        .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '') // dates
        .trim();

      if (!ownerName || ownerName.length < 3) continue;

      results.push({
        source_type: source.sourceType,
        source_id: `${source.state}-CS-${source.county.replace(/\s+/g, '')}-${parcelMatch?.[1] ?? ownerName.replace(/\s+/g, '-')}-${amount}`,
        source_url: url,
        state: source.state,
        county: source.county,
        owner_name: ownerName,
        owner_address: null,
        holder_name: source.holderName,
        property_description: `${source.sourceType === 'tax_sale_surplus' ? 'Tax sale' : 'Foreclosure'} surplus — ${source.county} County`,
        reported_amount: amount,
        parcel_number: parcelMatch?.[1] ?? null,
        sale_date: null,
        surplus_date: null,
        deadline_date: null,
        raw_data: { line, source_county: source.county, pdf_url: url, scraped_at: new Date().toISOString() },
      });
    }

    this.log(`Parsed ${results.length} records from PDF (${lines.length} lines)`);
    return results;
  }

  private parseHTMLForSurplus(html: string, source: CountyPDFSource, url: string): ScrapedOpportunity[] {
    // Some counties publish surplus lists as HTML tables
    const cheerio = require('cheerio') as typeof import('cheerio');
    const $ = cheerio.load(html);
    const results: ScrapedOpportunity[] = [];

    $('table tbody tr').each((_, el) => {
      const cells = $(el).find('td');
      if (cells.length < 2) return;

      const texts = cells.map((_, c) => $(c).text().trim()).get();
      // Find the cell with a dollar amount
      const amountCell = texts.find(t => /\$[\d,]+/.test(t));
      if (!amountCell) return;

      const amount = parseFloat(amountCell.replace(/[$,]/g, ''));
      if (isNaN(amount) || amount < 100) return;

      // First non-amount text cell is likely the owner name
      const ownerName = texts.find(t => t.length > 2 && !/^\$/.test(t) && !/^\d+$/.test(t));
      if (!ownerName) return;

      const parcel = texts.find(t => /\d{2,}-\d{2,}-\d{2,}/.test(t));

      results.push({
        source_type: source.sourceType,
        source_id: `${source.state}-CS-${source.county.replace(/\s+/g, '')}-${parcel ?? ownerName.replace(/\s+/g, '-')}-${amount}`,
        source_url: url,
        state: source.state,
        county: source.county,
        owner_name: ownerName,
        owner_address: null,
        holder_name: source.holderName,
        property_description: `${source.sourceType === 'tax_sale_surplus' ? 'Tax sale' : 'Foreclosure'} surplus`,
        reported_amount: amount,
        parcel_number: parcel ?? null,
        sale_date: null,
        surplus_date: null,
        deadline_date: null,
        raw_data: { cells: texts, html_url: url, scraped_at: new Date().toISOString() },
      });
    });

    this.log(`Parsed ${results.length} records from HTML table`);
    return results;
  }
}
```

**Step 2: Commit**

```bash
git add apps/worker/src/scrapers/county-surplus.ts
git commit -m "feat: add county surplus PDF/HTML scraper"
```

---

### Task 6: Create scraper registry and wire into ingestion processor

**Files:**
- Create: `apps/worker/src/scrapers/index.ts`
- Modify: `apps/worker/src/processors/ingestion.ts` — replace `scrapeStateSurplus` entirely

**Step 1: Create scraper registry**

```typescript
// apps/worker/src/scrapers/index.ts
import type { Scraper } from './types.js';
import { TexasSodaScraper } from './texas-soda.js';
import { FloridaUPScraper } from './florida-up.js';
import { CaliforniaUPScraper } from './california-up.js';
import { OhioUPScraper } from './ohio-up.js';
import { NewYorkUPScraper } from './newyork-up.js';
import { CountySurplusScraper } from './county-surplus.js';

export type { ScrapedOpportunity, ScraperResult, Scraper } from './types.js';

export function getScrapersForState(state: string): Scraper[] {
  const scrapers: Scraper[] = [];

  switch (state) {
    case 'TX':
      scrapers.push(new TexasSodaScraper());
      scrapers.push(new CountySurplusScraper('TX'));
      break;
    case 'FL':
      scrapers.push(new FloridaUPScraper());
      scrapers.push(new CountySurplusScraper('FL'));
      break;
    case 'CA':
      scrapers.push(new CaliforniaUPScraper());
      scrapers.push(new CountySurplusScraper('CA'));
      break;
    case 'OH':
      scrapers.push(new OhioUPScraper());
      break;
    case 'NY':
      scrapers.push(new NewYorkUPScraper());
      break;
    default:
      throw new Error(`No scrapers configured for state: ${state}`);
  }

  return scrapers;
}
```

**Step 2: Rewrite ingestion.ts `scrapeStateSurplus` function**

Replace the entire fake generator (`scrapeStateSurplus` function, lines 186-284) and all the fake data code (lines 26-172: STATE_CONFIGS, FIRST_NAMES, LAST_NAMES, random helpers, generators) with:

```typescript
async function scrapeStateSurplus(job: Job): Promise<ScrapeResult> {
  const { state, triggeredBy } = job.data as { state: string; triggeredBy?: string };

  const scrapers = getScrapersForState(state);
  const batchId = `batch-${state}-${Date.now()}`;

  let totalFound = 0;
  let inserted = 0;
  let jobsQueued = 0;
  const allErrors: string[] = [];

  for (const scraper of scrapers) {
    try {
      const result = await scraper.scrape();
      totalFound += result.found;
      allErrors.push(...result.errors);

      console.log(
        `[Ingestion] ${scraper.name}: ${result.found} found in ${result.durationMs}ms` +
        (result.errors.length ? ` (${result.errors.length} errors)` : ''),
      );

      // Insert opportunities with dedup
      for (const opp of result.opportunities) {
        const id = crypto.randomUUID();
        const jurisdictionKey = buildJurisdictionKey(opp.state, opp.county, opp.source_type);

        const dbResult = await query<{ id: string }>(
          `INSERT INTO opportunities (
            id, source_type, source_id, source_url, state, county, jurisdiction_key,
            reported_amount, owner_name, owner_address, holder_name, property_description,
            parcel_number, sale_date, surplus_date, deadline_date,
            ingestion_batch, raw_data, status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16,
            $17, $18, 'new', NOW(), NOW()
          )
          ON CONFLICT (source_type, source_id) DO NOTHING
          RETURNING id`,
          [
            id, opp.source_type, opp.source_id, opp.source_url, opp.state, opp.county, jurisdictionKey,
            opp.reported_amount, opp.owner_name, opp.owner_address, opp.holder_name, opp.property_description,
            opp.parcel_number, opp.sale_date, opp.surplus_date, opp.deadline_date,
            batchId,
            JSON.stringify({
              ...opp.raw_data,
              triggered_by: triggeredBy ?? 'system',
              scraper: scraper.name,
            }),
          ],
        );

        if (dbResult.rowCount && dbResult.rowCount > 0) {
          inserted++;
          await ingestionQueue.add('auto-enroll', { opportunityId: dbResult.rows[0].id });
          jobsQueued++;
        }
      }
    } catch (err) {
      allErrors.push(`${scraper.name}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await scraper.dispose();
    }
  }

  const duplicates = totalFound - inserted;

  console.log(
    `[Ingestion] ${state} scrape complete: ${totalFound} found, ` +
    `${inserted} new, ${duplicates} duplicates, ${jobsQueued} jobs queued (batch: ${batchId})` +
    (allErrors.length ? ` — ${allErrors.length} errors` : ''),
  );

  if (allErrors.length > 0) {
    console.warn(`[Ingestion] ${state} errors:`, allErrors.slice(0, 5));
  }

  return { state, found: totalFound, inserted, duplicates, jobsQueued };
}
```

Keep the `buildJurisdictionKey` helper and the `autoEnroll`/`importCsv` functions unchanged.

**Step 3: Commit**

```bash
git add apps/worker/src/scrapers/index.ts apps/worker/src/processors/ingestion.ts
git commit -m "feat: wire real scrapers into ingestion pipeline, remove fake data generator"
```

---

### Task 7: Add dependencies and update Dockerfile for Chromium

**Files:**
- Modify: `apps/worker/package.json` — add `cheerio`, `pdf-parse`
- Modify: `apps/worker/Dockerfile` — install Chromium for Puppeteer

**Step 1: Add npm dependencies**

```bash
cd /tmp/SurplusFlow-AI && npm install -w apps/worker cheerio pdf-parse
npm install -w apps/worker -D @types/pdf-parse
```

**Step 2: Update Dockerfile for Chromium**

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/admin-web/package.json apps/admin-web/
COPY apps/portal-web/package.json apps/portal-web/
COPY packages/shared/package.json packages/shared/
COPY packages/rules/package.json packages/rules/
COPY packages/contracts/package.json packages/contracts/
COPY packages/audit/package.json packages/audit/
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY packages/ packages/
COPY apps/worker/ apps/worker/
CMD ["npx", "tsx", "apps/worker/src/index.ts"]
```

**Step 3: Commit**

```bash
git add apps/worker/package.json apps/worker/Dockerfile package-lock.json
git commit -m "feat: add cheerio, pdf-parse deps and Chromium to worker Dockerfile"
```

---

### Task 8: Enable pg_trgm fuzzy matching in auto-enroll

**Files:**
- Create: `infra/migrations/002_pg_trgm.sql`
- Modify: `apps/worker/src/processors/ingestion.ts` — update claimant lookup in `autoEnroll`

**Step 1: Create migration**

```sql
-- 002_pg_trgm.sql — Enable fuzzy name matching for claimant lookup
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_claimant_name_trgm
  ON claimants USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

COMMIT;
```

**Step 2: Update claimant lookup in autoEnroll (ingestion.ts)**

Replace the exact match query (lines 346-349):
```typescript
const existingClaimant = await query<{ id: string }>(
  `SELECT id FROM claimants WHERE first_name = $1 AND last_name = $2 LIMIT 1`,
  [firstName, lastName],
);
```

With fuzzy match:
```typescript
const existingClaimant = await query<{ id: string; sim: number }>(
  `SELECT id, similarity(first_name || ' ' || last_name, $1) AS sim
   FROM claimants
   WHERE similarity(first_name || ' ' || last_name, $1) > 0.4
     AND do_not_contact = FALSE
   ORDER BY sim DESC
   LIMIT 1`,
  [ownerName],
);
```

**Step 3: Run migration on VPS**

```bash
ssh root@187.77.27.52 "docker exec sf-postgres psql -U sfuser -d surplusflow -f -" < infra/migrations/002_pg_trgm.sql
```

**Step 4: Commit**

```bash
git add infra/migrations/002_pg_trgm.sql apps/worker/src/processors/ingestion.ts
git commit -m "feat: enable pg_trgm fuzzy name matching for claimant lookup"
```

---

### Task 9: Deploy and verify

**Step 1: Push to GitHub**

```bash
cd /tmp/SurplusFlow-AI && git push origin main
```

**Step 2: Deploy to VPS**

```bash
ssh root@187.77.27.52 "cd /tmp/sf-build && git pull origin main && cd infra/docker && docker compose build worker && docker compose up -d --force-recreate worker"
```

**Step 3: Run pg_trgm migration**

```bash
ssh root@187.77.27.52 "docker exec sf-postgres psql -U sfuser -d surplusflow -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'"
```

**Step 4: Trigger a real scrape and verify**

```bash
# Login, get token, trigger TX scrape
ssh root@187.77.27.52 << 'EOF'
TOKEN=$(curl -s -X POST http://localhost:3201/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@surplusflow.com","password":"SurplusFlow2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
curl -s -X POST http://localhost:3201/api/v1/opportunities/trigger-scrape -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"states":["TX"]}'
sleep 15
docker logs sf-worker --tail 30
EOF
```

**Step 5: Verify real data in database**

```bash
ssh root@187.77.27.52 "docker exec sf-postgres psql -U sfuser -d surplusflow -c \"SELECT source_type, source_id, owner_name, reported_amount, source_url FROM opportunities ORDER BY created_at DESC LIMIT 5;\""
```

Expected: real owner names, real amounts, real source URLs from data.texas.gov — not randomly generated fake data.
