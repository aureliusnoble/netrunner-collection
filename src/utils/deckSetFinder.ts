import type {
  CardPool,
  Decklist,
  DeckSetResult,
  MissingCardInfo,
  SearchProgress,
} from '../types';

/**
 * For a single deck, compute which cards are missing from the pool.
 * Returns total missing count and a map of cardId → shortfall.
 */
export function computeMissingCards(
  deck: Decklist,
  pool: CardPool
): { totalMissing: number; missing: Map<string, number> } {
  const missing = new Map<string, number>();
  let totalMissing = 0;

  for (const [cardId, needed] of Object.entries(deck.attributes.card_slots)) {
    const available = pool.get(cardId) || 0;
    if (needed > available) {
      const shortfall = needed - available;
      missing.set(cardId, shortfall);
      totalMissing += shortfall;
    }
  }

  return { totalMissing, missing };
}

/**
 * For a SET of decks, compute aggregate card needs vs pool.
 * Cards shared across decks all draw from the same pool.
 */
export function computeSetMissingCards(
  decks: Decklist[],
  pool: CardPool,
  cardTitles: Map<string, string>
): { totalMissing: number; missingCards: MissingCardInfo[] } {
  // Aggregate card needs across all decks
  const totalNeeds = new Map<string, number>();
  const requestedBy = new Map<string, string[]>();

  for (const deck of decks) {
    for (const [cardId, count] of Object.entries(deck.attributes.card_slots)) {
      totalNeeds.set(cardId, (totalNeeds.get(cardId) || 0) + count);
      if (!requestedBy.has(cardId)) requestedBy.set(cardId, []);
      requestedBy.get(cardId)!.push(deck.attributes.name);
    }
  }

  const missingCards: MissingCardInfo[] = [];
  let totalMissing = 0;

  for (const [cardId, needed] of totalNeeds) {
    const available = pool.get(cardId) || 0;
    if (needed > available) {
      const shortfall = needed - available;
      totalMissing += shortfall;
      missingCards.push({
        cardId,
        cardTitle: cardTitles.get(cardId) || cardId,
        needed,
        available,
        shortfall,
        requestedBy: requestedBy.get(cardId) || [],
      });
    }
  }

  // Sort by shortfall descending
  missingCards.sort((a, b) => b.shortfall - a.shortfall);

  return { totalMissing, missingCards };
}

interface FactionBucket {
  factionId: string;
  decks: Decklist[];
}

/**
 * Find all valid deck set combinations using filtered brute force with pruning.
 */
export function findDeckSets(
  buckets: FactionBucket[],
  pool: CardPool,
  maxMissing: number,
  cardTitles: Map<string, string>,
  onProgress?: (progress: SearchProgress) => void,
  abortSignal?: { aborted: boolean }
): DeckSetResult[] {
  const results: DeckSetResult[] = [];
  const MAX_RESULTS = 200;

  // Sort buckets by size ascending (fewest candidates first for better pruning)
  const sortedBuckets = [...buckets].sort((a, b) => a.decks.length - b.decks.length);

  // Total combinations for progress
  let totalCombos = 1;
  for (const b of sortedBuckets) totalCombos *= b.decks.length;
  let checked = 0;

  // Running tally of card needs
  const runningNeeds = new Map<string, number>();

  function addDeckToTally(deck: Decklist) {
    for (const [cardId, count] of Object.entries(deck.attributes.card_slots)) {
      runningNeeds.set(cardId, (runningNeeds.get(cardId) || 0) + count);
    }
  }

  function removeDeckFromTally(deck: Decklist) {
    for (const [cardId, count] of Object.entries(deck.attributes.card_slots)) {
      const current = runningNeeds.get(cardId) || 0;
      const next = current - count;
      if (next <= 0) runningNeeds.delete(cardId);
      else runningNeeds.set(cardId, next);
    }
  }

  function currentMissing(): number {
    let total = 0;
    for (const [cardId, needed] of runningNeeds) {
      const available = pool.get(cardId) || 0;
      if (needed > available) total += needed - available;
    }
    return total;
  }

  const usedDeckIds = new Set<string>();

  function search(depth: number, chosenDecks: Decklist[]) {
    if (abortSignal?.aborted) return;
    if (results.length >= MAX_RESULTS) return;

    // Pruning: check current partial missing count
    const partialMissing = currentMissing();
    if (partialMissing > maxMissing) return;

    if (depth === sortedBuckets.length) {
      // Complete combination found
      checked++;
      if (checked % 1000 === 0) {
        onProgress?.({
          phase: 'combining',
          message: `Checked ${checked.toLocaleString()} / ${totalCombos.toLocaleString()} combinations (${results.length} valid)`,
          current: checked,
          total: totalCombos,
        });
      }

      const { totalMissing, missingCards } = computeSetMissingCards(
        chosenDecks,
        pool,
        cardTitles
      );

      if (totalMissing <= maxMissing) {
        results.push({
          decks: [...chosenDecks],
          totalMissingCards: totalMissing,
          missingCards,
          combinedPopularity: 0,
        });
      }
      return;
    }

    const bucket = sortedBuckets[depth];
    for (const deck of bucket.decks) {
      if (abortSignal?.aborted) return;
      if (results.length >= MAX_RESULTS) return;

      // Prevent the same deck appearing twice in one set
      if (usedDeckIds.has(deck.id)) continue;

      usedDeckIds.add(deck.id);
      addDeckToTally(deck);
      chosenDecks.push(deck);
      search(depth + 1, chosenDecks);
      chosenDecks.pop();
      removeDeckFromTally(deck);
      usedDeckIds.delete(deck.id);
    }
  }

  search(0, []);

  // Sort results: fewest missing first
  results.sort((a, b) => a.totalMissingCards - b.totalMissingCards);

  return results;
}

/**
 * Pre-filter decks: keep only those individually buildable within tolerance.
 * Returns decks sorted by missing card count ascending.
 */
export function preFilterDecks(
  decks: Decklist[],
  pool: CardPool,
  maxMissing: number
): Decklist[] {
  const withMissing = decks.map((deck) => {
    const { totalMissing } = computeMissingCards(deck, pool);
    return { deck, totalMissing };
  });

  return withMissing
    .filter((d) => d.totalMissing <= maxMissing)
    .sort((a, b) => a.totalMissing - b.totalMissing)
    .map((d) => d.deck);
}
