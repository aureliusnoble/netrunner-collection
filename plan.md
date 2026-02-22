# Feature: Unique Decks Across Sets

## Goal
Add a toggle that constrains results so each deck appears at most once across ALL result sets. When enabled, partial sets (fewer decks than requested) are allowed. The optimization should maximize unique deck coverage while minimizing the number of sets.

## Algorithm: Greedy Maximum Coverage

Post-process the normal search results (up to 200 candidate sets) with a greedy deduplication step:

1. Run the normal `findDeckSets` search (unchanged)
2. Track a global `usedDeckIds` set
3. While candidate sets remain with unused decks:
   a. For each candidate, count how many of its decks are NOT yet used (`newDeckCount`)
   b. Pick the candidate with the **highest `newDeckCount`** (ties broken by **lowest `totalMissingCards`**)
   c. Create a result set containing only the unused decks from that candidate
   d. Recompute missing cards for this (potentially partial) set via `computeSetMissingCards`
   e. Mark those decks as globally used
   f. Remove candidate from the pool
4. Sort final results: by deck count DESC (complete sets first), then totalMissingCards ASC

This greedy approach is O(n²) where n = number of candidate results (max 200), so it's effectively instant.

**Why this works well:**
- Each iteration picks the set that adds the most new decks → naturally prefers complete sets
- Minimizes fragmentation — a full 4-deck set is chosen over two 2-deck partials
- Quality tiebreaker ensures best decks rise to the top
- Partial sets only form when decks are genuinely contested between candidates

## Changes

### 1. `src/types/index.ts`
- Add `uniqueDecksAcrossSets: boolean` to `SearchConfig` interface
- Add optional `isPartial?: boolean` and `originalDeckCount?: number` to `DeckSetResult` (to track partial sets)

### 2. `src/utils/deckSetFinder.ts`
- Add new exported function `deduplicateDeckSets(results, pool, cardTitles, numDecks) → DeckSetResult[]`
  - Implements the greedy maximum coverage algorithm above
  - Returns deduplicated results with `isPartial` flags set
  - Recomputes missing cards for partial sets

### 3. `src/components/SearchConfig.tsx`
- Add `uniqueDecksAcrossSets` boolean state (default: false)
- Add a toggle/checkbox in the search config UI, below the existing "Missing Cards Allowed" section
- Include it in the config passed to `onSearch`

### 4. `src/App.tsx`
- After `findDeckSets` returns, if `config.uniqueDecksAcrossSets` is true:
  - Call `deduplicateDeckSets(found, cardPool, cardTitles, config.numDecks)`
  - Use deduplicated results instead
  - Update progress message to reflect deduplicated count

### 5. `src/components/ResultsView.tsx`
- When a set has `isPartial === true`, show a visual indicator (e.g., "Partial (2/4 decks)" badge)
- Differentiate partial sets from complete ones in the results list
