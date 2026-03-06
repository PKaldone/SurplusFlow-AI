import { BaseScraper } from './base.js';
import type { ScrapedOpportunity, ScraperConfig } from './types.js';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

const SEARCH_URL = 'https://claimittexas.gov';

const SEARCH_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson',
  'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee',
];

export class TexasSodaScraper extends BaseScraper {
  readonly name = 'texas-up';

  constructor(config?: Partial<ScraperConfig>) {
    super({
      state: 'TX',
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
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      );

      const namesToSearch = this.shuffleArray(SEARCH_NAMES).slice(0, 4);

      for (const lastName of namesToSearch) {
        if (opportunities.length >= this.config.maxResults) break;

        try {
          await this.throttle();
          this.log(`Searching TX for: ${lastName}`);

          await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: this.config.timeoutMs });
          await new Promise(r => setTimeout(r, 3000));

          const input = await page.$('input[name="lastName"]')
            ?? await page.$('input[id*="last"]')
            ?? await page.$('input[placeholder*="Last"]')
            ?? await page.$('input[type="text"]');

          if (!input) {
            this.errors.push('TX: Could not find search input');
            continue;
          }

          await input.click({ clickCount: 3 });
          await input.type(lastName, { delay: 50 });

          const btn = await page.$('button[type="submit"]')
            ?? await page.$('input[type="submit"]');

          if (btn) {
            await btn.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => null);
            await new Promise(r => setTimeout(r, 3000));
          }

          const html = await page.content();
          const results = this.parseResults(html, lastName);
          opportunities.push(...results);
          this.log(`TX: ${results.length} results for "${lastName}"`);
        } catch (err) {
          this.errors.push(`TX "${lastName}": ${err instanceof Error ? err.message : String(err)}`);
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
            source_id: `TX-UP-${name.replace(/\s+/g, '-')}-${amount}`,
            source_url: SEARCH_URL,
            state: 'TX',
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
