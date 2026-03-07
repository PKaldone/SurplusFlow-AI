import crypto from 'node:crypto';
import type { Scraper, ScraperConfig, ScraperResult, ScrapedOpportunity } from './types.js';

// No simulated/fallback data — only real scraped records enter the pipeline.

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

    if (opportunities.length === 0) {
      console.log(`[${this.name}] Real scrape returned 0 results for ${this.config.state}`);
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
      const backoff = 5000 * Math.pow(3, attempt);
      await new Promise(r => setTimeout(r, backoff));
    }
    throw lastErr ?? new Error(`All ${this.config.maxRetries} retries failed for ${label}`);
  }

  protected log(msg: string): void {
    console.log(`[${this.name}] ${msg}`);
  }
}
