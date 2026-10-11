import { HUMANIZE_MAX_ITEMS, HUMANIZE_MAX_TEXT_CHARS } from './config';

/** Drop empty and oversized labels before they are sent to the humanizer. */
export function boundHumanizeInput(texts: string[]): string[] {
  const bounded: string[] = [];
  for (const text of texts) {
    if (bounded.length >= HUMANIZE_MAX_ITEMS) break;
    if (text.length === 0 || text.length > HUMANIZE_MAX_TEXT_CHARS) continue;
    bounded.push(text);
  }
  return bounded;
}
