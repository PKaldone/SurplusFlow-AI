import type { Scraper } from './types.js';
import { createTexasScraper, createFloridaScraper, createCaliforniaScraper, createOhioScraper, createNewYorkScraper } from './sws-scraper.js';
import { CountySurplusScraper } from './county-surplus.js';

export type { ScrapedOpportunity, ScraperResult, Scraper } from './types.js';

export function getScrapersForState(state: string): Scraper[] {
  const scrapers: Scraper[] = [];

  switch (state) {
    case 'TX':
      scrapers.push(createTexasScraper());
      scrapers.push(new CountySurplusScraper('TX'));
      break;
    case 'FL':
      scrapers.push(createFloridaScraper());
      scrapers.push(new CountySurplusScraper('FL'));
      break;
    case 'CA':
      scrapers.push(createCaliforniaScraper());
      scrapers.push(new CountySurplusScraper('CA'));
      break;
    case 'OH':
      scrapers.push(createOhioScraper());
      break;
    case 'NY':
      scrapers.push(createNewYorkScraper());
      break;
    default:
      throw new Error(`No scrapers configured for state: ${state}`);
  }

  return scrapers;
}
