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
