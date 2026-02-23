import type { Printing } from '../types';

const IMAGE_BASE_URL = 'https://card-images.netrunnerdb.com/v2/large';

/**
 * Build a map from card_id → printing_id, choosing the latest printing
 * (by date_release, then by position as tiebreaker).
 */
export function buildCardToPrintingMap(printings: Printing[]): Map<string, string> {
  const best = new Map<string, { printingId: string; date: string; position: number }>();

  for (const p of printings) {
    const cardId = p.attributes.card_id;
    const date = p.attributes.date_release || '0000-00-00';
    const position = p.attributes.position;
    const existing = best.get(cardId);

    if (
      !existing ||
      date > existing.date ||
      (date === existing.date && position > existing.position)
    ) {
      best.set(cardId, { printingId: p.id, date, position });
    }
  }

  const result = new Map<string, string>();
  for (const [cardId, info] of best) {
    result.set(cardId, info.printingId);
  }
  return result;
}

/** Get the large card image URL for a given printing ID. */
export function getCardImageUrl(printingId: string): string {
  return `${IMAGE_BASE_URL}/${printingId}.jpg`;
}
