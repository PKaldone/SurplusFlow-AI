export interface ScrapedOpportunity {
  source_type: 'unclaimed_property' | 'tax_sale_surplus' | 'foreclosure_surplus';
  source_id: string;
  source_url: string;
  state: string;
  county: string | null;
  owner_name: string;
  owner_address: string | null;
  holder_name: string | null;
  property_description: string | null;
  reported_amount: number | null;
  parcel_number: string | null;
  sale_date: string | null;
  surplus_date: string | null;
  deadline_date: string | null;
  raw_data: Record<string, unknown>;
}

export interface ScraperConfig {
  state: string;
  minDelayMs: number;
  maxRetries: number;
  timeoutMs: number;
  maxResults: number;
}

export interface ScraperResult {
  state: string;
  source: string;
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
