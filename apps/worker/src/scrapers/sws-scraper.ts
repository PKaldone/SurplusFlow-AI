// Shared SWS/Kelmar platform scraper — used by TX, CA, OH, NY (all same Angular SPA)
import { BaseScraper } from './base.js';
import type { ScrapedOpportunity, ScraperConfig } from './types.js';
import puppeteer from 'puppeteer';

interface SWSProperty {
  swsPropertyID?: number;
  uuid?: string;
  ownerName?: string;
  ownerAddress1?: string;
  ownerAddress2?: string;
  ownerCity?: string;
  ownerState?: string;
  ownerZip?: string;
  holderName?: string;
  propertyType?: string;
  propertyTypeDescription?: string;
  propertyValueDescription?: string;
  cashReported?: number;
  sharesReported?: number;
  propertyID?: string;
  reportedDate?: string;
  [key: string]: unknown;
}

interface SWSResponse {
  properties?: SWSProperty[];
  anyExactMatch?: boolean;
  [key: string]: unknown;
}

interface SWSScraperOptions {
  state: string;
  baseUrl: string;
  searchPath: string;
  searchNames: string[];
  sourceType: 'unclaimed_property';
}

const DEFAULT_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Lopez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson',
];

export class SWSScraper extends BaseScraper {
  readonly name: string;
  private opts: SWSScraperOptions;

  constructor(opts: SWSScraperOptions, config?: Partial<ScraperConfig>) {
    super({
      state: opts.state,
      minDelayMs: 5000,
      maxRetries: 2,
      timeoutMs: 60_000,
      maxResults: 200,
      ...config,
    });
    this.opts = opts;
    this.name = `${opts.state.toLowerCase()}-sws`;
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

      const namesToSearch = this.shuffleArray(this.opts.searchNames).slice(0, 3);

      for (const lastName of namesToSearch) {
        if (opportunities.length >= this.config.maxResults) break;

        try {
          await this.throttle();
          this.log(`Searching ${this.opts.state} for: ${lastName}`);

          // Set up response interceptor BEFORE navigation
          let apiResponse: SWSResponse | null = null;
          const responsePromise = new Promise<SWSResponse | null>((resolve) => {
            const timeout = setTimeout(() => resolve(null), 30_000);
            page.on('response', async (res) => {
              if (res.url().includes('SWS/properties') && res.request().method() === 'POST') {
                try {
                  const json = await res.json() as SWSResponse;
                  apiResponse = json;
                  clearTimeout(timeout);
                  resolve(json);
                } catch { /* ignore */ }
              }
            });
          });

          await page.goto(`${this.opts.baseUrl}${this.opts.searchPath}`, {
            waitUntil: 'networkidle2',
            timeout: this.config.timeoutMs,
          });

          // Wait for Angular app to bootstrap
          await new Promise(r => setTimeout(r, 4000));

          // Find the last name input — SWS apps use formControlName="lastName"
          const lastNameInput = await page.$('input[formcontrolname="lastName"]')
            ?? await page.$('input[name="lastName"]')
            ?? await page.$('input[id*="lastName"]')
            ?? await page.$('input[placeholder*="Last"]');

          if (!lastNameInput) {
            this.errors.push(`${this.opts.state}: Could not find lastName input`);
            continue;
          }

          await lastNameInput.click({ clickCount: 3 });
          await lastNameInput.type(lastName, { delay: 30 });

          // Wait for Turnstile to auto-verify (invisible challenge)
          await new Promise(r => setTimeout(r, 3000));

          // Find and click search button
          const searchBtn = await page.$('button[type="submit"]')
            ?? await page.$('button.search-btn')
            ?? await page.$('button:not([disabled])');

          if (searchBtn) {
            await searchBtn.click();
          } else {
            // Try pressing Enter on the input
            await lastNameInput.press('Enter');
          }

          // Wait for the API response
          const response = await responsePromise;

          if (response?.properties && response.properties.length > 0) {
            const mapped = response.properties
              .map(p => this.mapProperty(p))
              .filter((p): p is ScrapedOpportunity => p !== null);
            opportunities.push(...mapped);
            this.log(`${this.opts.state}: ${mapped.length} results for "${lastName}"`);
          } else {
            this.log(`${this.opts.state}: 0 results for "${lastName}" (Turnstile may have blocked)`);
          }

          // Remove response listener for next iteration
          page.removeAllListeners('response');
        } catch (err) {
          this.errors.push(`${this.opts.state} "${lastName}": ${err instanceof Error ? err.message : String(err)}`);
          page.removeAllListeners('response');
        }
      }
    } finally {
      await browser.close();
    }

    return opportunities.slice(0, this.config.maxResults);
  }

  private mapProperty(p: SWSProperty): ScrapedOpportunity | null {
    const ownerName = (p.ownerName ?? '').trim();
    if (!ownerName) return null;

    const amount = p.cashReported ?? 0;

    const address = [p.ownerAddress1, p.ownerAddress2, p.ownerCity, p.ownerState, p.ownerZip]
      .filter(Boolean)
      .join(', ') || null;

    return {
      source_type: 'unclaimed_property',
      source_id: `${this.opts.state}-SWS-${p.swsPropertyID ?? p.propertyID ?? `${ownerName}-${amount}`}`,
      source_url: `${this.opts.baseUrl}${this.opts.searchPath}`,
      state: this.opts.state,
      county: null,
      owner_name: ownerName,
      owner_address: address,
      holder_name: p.holderName ?? null,
      property_description: p.propertyTypeDescription ?? p.propertyType ?? null,
      reported_amount: amount > 0 ? amount : null,
      parcel_number: null,
      sale_date: null,
      surplus_date: p.reportedDate ?? null,
      deadline_date: null,
      raw_data: p as Record<string, unknown>,
    };
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

// Factory functions for each state
export function createTexasScraper(config?: Partial<ScraperConfig>) {
  return new SWSScraper({
    state: 'TX',
    baseUrl: 'https://www.claimittexas.gov',
    searchPath: '/app/claim-search',
    searchNames: DEFAULT_NAMES,
    sourceType: 'unclaimed_property',
  }, config);
}

export function createCaliforniaScraper(config?: Partial<ScraperConfig>) {
  return new SWSScraper({
    state: 'CA',
    baseUrl: 'https://claimit.ca.gov',
    searchPath: '/app/claim-search',
    searchNames: [...DEFAULT_NAMES, 'Nguyen', 'Kim', 'Chen', 'Wang', 'Patel', 'Singh'],
    sourceType: 'unclaimed_property',
  }, config);
}

export function createOhioScraper(config?: Partial<ScraperConfig>) {
  return new SWSScraper({
    state: 'OH',
    baseUrl: 'https://unclaimedfunds.ohio.gov',
    searchPath: '/app/claim-search',
    searchNames: DEFAULT_NAMES,
    sourceType: 'unclaimed_property',
  }, config);
}

export function createNewYorkScraper(config?: Partial<ScraperConfig>) {
  return new SWSScraper({
    state: 'NY',
    baseUrl: 'https://ouf.osc.ny.gov',
    searchPath: '/app/claim-search',
    searchNames: [...DEFAULT_NAMES, 'Cohen', 'Chen', 'Kim', 'Patel', 'Singh'],
    sourceType: 'unclaimed_property',
  }, config);
}

export function createFloridaScraper(config?: Partial<ScraperConfig>) {
  return new SWSScraper({
    state: 'FL',
    baseUrl: 'https://www.fltreasurehunt.gov',
    searchPath: '/app/claim-search',
    searchNames: DEFAULT_NAMES,
    sourceType: 'unclaimed_property',
  }, config);
}
