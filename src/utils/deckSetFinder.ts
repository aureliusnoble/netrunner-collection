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
 * Deduplicate deck sets so each deck appears at most once across all results.
 * Uses a greedy maximum-coverage algorithm:
 *   - Each iteration picks the candidate set that adds the most new (unused) decks
 *   - Ties broken by fewest missing cards
 *   - When a set loses decks to earlier sets, gaps are filled with the best
 *     available deck of the same faction (even if already used elsewhere),
 *     minimizing missing cards. Only when no deck of the needed faction exists
 *     at all does the set remain partial.
 *
 * Objective: maximize unique deck coverage, keep sets complete.
 */
export function deduplicateDeckSets(
  results: DeckSetResult[],
  pool: CardPool,
  cardTitles: Map<string, string>,
  requestedDeckCount: number,
  allCandidatesByFaction?: Map<string, Decklist[]>
): DeckSetResult[] {
  if (results.length === 0) return [];

  const globalUsed = new Set<string>();
  const deduplicated: DeckSetResult[] = [];
  // Track which candidates are still available (by index)
  const remaining = new Set<number>(results.map((_, i) => i));

  while (remaining.size > 0) {
    let bestIdx = -1;
    let bestNewCount = 0;
    let bestMissing = Infinity;

    // Find the candidate with the most new (unused) decks
    for (const idx of remaining) {
      const candidate = results[idx];
      let newCount = 0;
      for (const deck of candidate.decks) {
        if (!globalUsed.has(deck.id)) newCount++;
      }

      if (newCount === 0) {
        // This candidate has no new decks to offer — remove it
        remaining.delete(idx);
        continue;
      }

      if (
        newCount > bestNewCount ||
        (newCount === bestNewCount && candidate.totalMissingCards < bestMissing)
      ) {
        bestIdx = idx;
        bestNewCount = newCount;
        bestMissing = candidate.totalMissingCards;
      }
    }

    if (bestIdx === -1) break; // No candidates with new decks

    const chosen = results[bestIdx];
    remaining.delete(bestIdx);

    // Extract only the unused decks from this set
    const unusedDecks = chosen.decks.filter((d) => !globalUsed.has(d.id));

    // Mark these decks as globally used
    for (const deck of unusedDecks) {
      globalUsed.add(deck.id);
    }

    const needsFilling = unusedDecks.length < chosen.decks.length;

    if (needsFilling && allCandidatesByFaction) {
      // Identify which factions lost a deck
      const removedFactions: string[] = [];
      for (const deck of chosen.decks) {
        if (globalUsed.has(deck.id) && !unusedDecks.some((d) => d.id === deck.id)) {
          removedFactions.push(deck.attributes.faction_id);
        }
      }

      // Build the working set and fill gaps with best available duplicates
      const setDecks = [...unusedDecks];
      const setDeckIds = new Set(setDecks.map((d) => d.id));
      const duplicateIds: string[] = [];

      for (const faction of removedFactions) {
        const candidates = allCandidatesByFaction.get(faction) || [];
        let bestFill: Decklist | null = null;
        let bestFillMissing = Infinity;
        let bestFillIsUnused = false;

        for (const candidate of candidates) {
          if (setDeckIds.has(candidate.id)) continue; // already in this set

          // Evaluate how well this candidate fills the gap
          const testDecks = [...setDecks, candidate];
          const { totalMissing } = computeSetMissingCards(testDecks, pool, cardTitles);
          const isUnused = !globalUsed.has(candidate.id);

          // Prefer lower missing; break ties by preferring unused decks
          if (
            totalMissing < bestFillMissing ||
            (totalMissing === bestFillMissing && isUnused && !bestFillIsUnused)
          ) {
            bestFill = candidate;
            bestFillMissing = totalMissing;
            bestFillIsUnused = isUnused;
          }
        }

        if (bestFill) {
          setDecks.push(bestFill);
          setDeckIds.add(bestFill.id);
          // If the fill deck is already used elsewhere, it's a shared/duplicate deck
          if (globalUsed.has(bestFill.id)) {
            duplicateIds.push(bestFill.id);
          } else {
            // Fill deck hasn't been used yet — claim it
            globalUsed.add(bestFill.id);
          }
        }
      }

      // Recompute missing cards for the filled set
      const { totalMissing, missingCards } = computeSetMissingCards(
        setDecks,
        pool,
        cardTitles
      );
      const stillPartial = setDecks.length < requestedDeckCount;
      deduplicated.push({
        decks: setDecks,
        totalMissingCards: totalMissing,
        missingCards,
        combinedPopularity: 0,
        isPartial: stillPartial,
        originalDeckCount: requestedDeckCount,
        duplicateDeckIds: duplicateIds.length > 0 ? duplicateIds : undefined,
      });
    } else if (needsFilling) {
      // No candidate pool available — fall back to partial set
      const { totalMissing, missingCards } = computeSetMissingCards(
        unusedDecks,
        pool,
        cardTitles
      );
      deduplicated.push({
        decks: unusedDecks,
        totalMissingCards: totalMissing,
        missingCards,
        combinedPopularity: 0,
        isPartial: true,
        originalDeckCount: requestedDeckCount,
      });
    } else {
      deduplicated.push({
        ...chosen,
        isPartial: false,
        originalDeckCount: requestedDeckCount,
      });
    }
  }

  // Sort: complete sets first, then by shared deck count ASC, then missing ASC
  deduplicated.sort((a, b) => {
    if (a.isPartial !== b.isPartial) return a.isPartial ? 1 : -1;
    const aShared = a.duplicateDeckIds?.length || 0;
    const bShared = b.duplicateDeckIds?.length || 0;
    if (aShared !== bShared) return aShared - bShared;
    return a.totalMissingCards - b.totalMissingCards;
  });

  return deduplicated;
}

/**
 * Check whether a deck contains any card that is completely absent from the pool.
 * Returns true if ALL cards in the deck exist in the pool (quantity >= 1).
 */
export function deckUsesOnlyPoolCards(deck: Decklist, pool: CardPool): boolean {
  for (const cardId of Object.keys(deck.attributes.card_slots)) {
    if (!pool.has(cardId) || pool.get(cardId)! <= 0) {
      return false;
    }
  }
  return true;
}

/**
 * Pre-filter decks: keep only those individually buildable within tolerance.
 * If excludeNotInPool is true, also reject decks that contain any card
 * completely absent from the collection.
 * Returns decks sorted by missing card count ascending.
 */
export function preFilterDecks(
  decks: Decklist[],
  pool: CardPool,
  maxMissing: number,
  excludeNotInPool = false
): Decklist[] {
  let candidates = decks;

  if (excludeNotInPool) {
    candidates = candidates.filter((deck) => deckUsesOnlyPoolCards(deck, pool));
  }

  const withMissing = candidates.map((deck) => {
    const { totalMissing } = computeMissingCards(deck, pool);
    return { deck, totalMissing };
  });

  return withMissing
    .filter((d) => d.totalMissing <= maxMissing)
    .sort((a, b) => a.totalMissing - b.totalMissing)
    .map((d) => d.deck);
}
