import { BaseScraper } from './base.js';
import type { ScrapedOpportunity, ScraperConfig } from './types.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
import * as cheerio from 'cheerio';

interface CountyPDFSource {
  state: string;
  county: string;
  urls: string[];
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
      'https://www.tax.co.harris.tx.us/ExcessProceeds',
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
        this.log(`Fetching: ${url}`);
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

    for (const line of lines) {
      const amountMatch = line.match(/\$?([\d,]+\.?\d{0,2})\s*$/);
      if (!amountMatch) continue;

      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      if (isNaN(amount) || amount < 100) continue;

      const parcelMatch = line.match(/(\d{2,4}[-]\d{2,4}[-]\d{2,4}[-]?\d{0,4})/);

      const textBeforeAmount = line.replace(amountMatch[0], '').trim();
      const nameText = parcelMatch
        ? textBeforeAmount.replace(parcelMatch[0], '').trim()
        : textBeforeAmount;

      const ownerName = nameText
        .replace(/^\d+\s+/, '')
        .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '')
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
    const $ = cheerio.load(html);
    const results: ScrapedOpportunity[] = [];

    $('table tbody tr').each((_, el) => {
      const cells = $(el).find('td');
      if (cells.length < 2) return;

      const texts = cells.map((_, c) => $(c).text().trim()).get();
      const amountCell = texts.find(t => /\$[\d,]+/.test(t));
      if (!amountCell) return;

      const amount = parseFloat(amountCell.replace(/[$,]/g, ''));
      if (isNaN(amount) || amount < 100) return;

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
