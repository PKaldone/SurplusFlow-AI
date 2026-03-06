import { BaseScraper } from './base.js';
import type { ScrapedOpportunity, ScraperConfig } from './types.js';

const DATASET_URL = 'https://data.texas.gov/resource/3un9-h9it.json';
const SOURCE_PAGE = 'https://data.texas.gov/Government-and-Taxes/Texas-Unclaimed-Property-Listing/3un9-h9it';

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
    const ownerName = String(rec.owner_name ?? rec.property_owner ?? rec.name ?? '').trim();
    if (!ownerName) return null;

    const amount = parseFloat(String(rec.reported_value ?? rec.cash_reported ?? rec.amount ?? '0'));
    if (isNaN(amount) || amount <= 0) return null;

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
