import { BaseScraper } from './base.js';
import type { ScrapedOpportunity, ScraperConfig } from './types.js';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

const SEARCH_URL = 'https://www.fltreasurehunt.gov';

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

      const namesToSearch = this.shuffleArray(SEARCH_NAMES).slice(0, 5);

      for (const lastName of namesToSearch) {
        if (opportunities.length >= this.config.maxResults) break;

        try {
          await this.throttle();
          this.log(`Searching FL for last name: ${lastName}`);

          await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: this.config.timeoutMs });

          await page.waitForSelector('input[name="lastName"], input[id*="lastName"], input[placeholder*="Last"]', {
            timeout: 15_000,
          }).catch(() => null);

          const lastNameInput = await page.$('input[name="lastName"]')
            ?? await page.$('input[id*="lastName"]')
            ?? await page.$('input[placeholder*="Last"]');

          if (!lastNameInput) {
            this.errors.push('Could not find last name input on FL search page');
            continue;
          }

          await lastNameInput.click({ clickCount: 3 });
          await lastNameInput.type(lastName, { delay: 50 });

          const searchBtn = await page.$('button[type="submit"]')
            ?? await page.$('input[type="submit"]');

          if (searchBtn) {
            await searchBtn.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => null);
            await new Promise(r => setTimeout(r, 3000));
          }

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

    $('table tbody tr, .search-result, .result-item, [class*="result"]').each((_, el) => {
      const cells = $(el).find('td');
      if (cells.length >= 3) {
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
