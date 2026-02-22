import { useState, useMemo } from 'react';
import type { Card, DeckSetResult, SearchProgress } from '../types';
import { FACTION_COLORS, FACTION_NAMES } from '../types';

interface Props {
  results: DeckSetResult[];
  searchProgress: SearchProgress | null;
  isSearching: boolean;
  cardLookup: Map<string, Card>;
  cardTitles: Map<string, string>;
  totalCandidateDecks: number;
}

export function ResultsView({
  results,
  searchProgress,
  isSearching,
  cardLookup,
  cardTitles,
  totalCandidateDecks,
}: Props) {
  const [expandedSet, setExpandedSet] = useState<number | null>(null);
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);
  const [expandedSummary, setExpandedSummary] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const pagedResults = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(results.length / PAGE_SIZE);

  // Aggregate missing cards across ALL result sets
  const aggregateMissing = useMemo(() => {
    if (results.length === 0) return [];

    // For each card, track the max shortfall seen in any single set,
    // plus how many sets need it
    const cardStats = new Map<
      string,
      { maxShortfall: number; totalShortfallAcrossSets: number; setsNeeding: number }
    >();

    for (const result of results) {
      for (const mc of result.missingCards) {
        const existing = cardStats.get(mc.cardId);
        if (existing) {
          existing.maxShortfall = Math.max(existing.maxShortfall, mc.shortfall);
          existing.totalShortfallAcrossSets += mc.shortfall;
          existing.setsNeeding += 1;
        } else {
          cardStats.set(mc.cardId, {
            maxShortfall: mc.shortfall,
            totalShortfallAcrossSets: mc.shortfall,
            setsNeeding: 1,
          });
        }
      }
    }

    return [...cardStats.entries()]
      .map(([cardId, stats]) => ({
        cardId,
        cardTitle: cardTitles.get(cardId) || cardId,
        maxShortfall: stats.maxShortfall,
        totalShortfallAcrossSets: stats.totalShortfallAcrossSets,
        setsNeeding: stats.setsNeeding,
        pctSets: Math.round((stats.setsNeeding / results.length) * 100),
      }))
      .sort((a, b) => b.setsNeeding - a.setsNeeding || b.maxShortfall - a.maxShortfall);
  }, [results, cardTitles]);

  // Count unique decks appearing in at least one result set
  const uniqueDecksInResults = useMemo(() => {
    const ids = new Set<string>();
    for (const r of results) {
      for (const d of r.decks) ids.add(d.id);
    }
    return ids.size;
  }, [results]);

  if (!searchProgress && results.length === 0 && !isSearching) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4 opacity-30">📊</div>
        <h2 className="text-xl font-semibold text-gray-400 mb-2">No Results Yet</h2>
        <p className="text-gray-500">Configure a search in the Search tab to find deck sets.</p>
      </div>
    );
  }

  if (isSearching) {
    return (
      <div className="text-center py-20">
        <div className="mb-6">
          <div className="inline-block w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        </div>
        <p className="text-gray-300 mb-2">{searchProgress?.message || 'Searching...'}</p>
        {searchProgress && searchProgress.total > 0 && (
          <div className="max-w-sm mx-auto mt-4">
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (searchProgress.current / searchProgress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">
            {searchProgress?.message || `${results.length} deck sets found`}
          </span>
          {results.length > 0 && (
            <div className="text-sm text-gray-400">
              Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, results.length)} of{' '}
              {results.length}
            </div>
          )}
        </div>
        {results.length > 0 && totalCandidateDecks > 0 && (
          <div className="mt-2 pt-2 border-t border-white/5 flex gap-6 text-xs text-gray-400">
            <span>
              Candidate decks used:{' '}
              <span className="text-cyan-400 font-medium">
                {uniqueDecksInResults}
              </span>
              {' / '}
              {totalCandidateDecks}
              {' '}
              ({totalCandidateDecks > 0
                ? Math.round((uniqueDecksInResults / totalCandidateDecks) * 100)
                : 0}% appear in at least one set)
            </span>
          </div>
        )}
      </div>

      {/* Aggregate missing cards summary */}
      {aggregateMissing.length > 0 && (
        <div className="bg-yellow-500/5 rounded-xl border border-yellow-500/20 overflow-hidden">
          <button
            onClick={() => setExpandedSummary(!expandedSummary)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-white/3 transition-colors"
          >
            <div>
              <h3 className="text-sm font-semibold text-yellow-400">
                Missing Cards Summary
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {aggregateMissing.length} unique card{aggregateMissing.length !== 1 ? 's' : ''} missing
                across {results.length} deck set{results.length !== 1 ? 's' : ''}
              </p>
            </div>
            <span className="text-gray-500 text-sm">{expandedSummary ? '▲' : '▼'}</span>
          </button>

          {expandedSummary && (
            <div className="border-t border-yellow-500/10 p-4">
              <div className="text-xs text-gray-500 mb-3 grid grid-cols-[1fr_80px_80px_80px] gap-2 font-semibold uppercase tracking-wider">
                <span>Card</span>
                <span className="text-right">Max Missing</span>
                <span className="text-right">Sets Need</span>
                <span className="text-right">% of Sets</span>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {aggregateMissing.map((mc) => (
                  <div
                    key={mc.cardId}
                    className="grid grid-cols-[1fr_80px_80px_80px] gap-2 text-sm py-1 px-1 rounded hover:bg-white/5"
                  >
                    <span className="text-yellow-300 truncate">{mc.cardTitle}</span>
                    <span className="text-right text-gray-400">-{mc.maxShortfall}</span>
                    <span className="text-right text-gray-400">
                      {mc.setsNeeding}/{results.length}
                    </span>
                    <span className="text-right">
                      <span
                        className={`${
                          mc.pctSets === 100
                            ? 'text-red-400'
                            : mc.pctSets >= 50
                              ? 'text-yellow-400'
                              : 'text-gray-400'
                        }`}
                      >
                        {mc.pctSets}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3 pt-2 border-t border-white/5">
                <strong>Max Missing</strong> = most copies short in any single set.{' '}
                <strong>Sets Need</strong> = how many sets are missing this card.{' '}
                Cards at 100% appear in every result set.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {pagedResults.map((result, idx) => {
        const globalIdx = page * PAGE_SIZE + idx;
        const isExpanded = expandedSet === globalIdx;

        return (
          <div
            key={globalIdx}
            className={`bg-white/5 rounded-xl border transition-colors ${
              isExpanded ? 'border-cyan-500/30' : 'border-white/10'
            }`}
          >
            {/* Set header */}
            <button
              onClick={() => setExpandedSet(isExpanded ? null : globalIdx)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors rounded-xl"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="text-lg font-bold text-gray-500 w-8 shrink-0">#{globalIdx + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {result.decks.map((deck, di) => (
                      <span
                        key={di}
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: (FACTION_COLORS[deck.attributes.faction_id] || '#666') + '20',
                          color: FACTION_COLORS[deck.attributes.faction_id] || '#999',
                          border: `1px solid ${(FACTION_COLORS[deck.attributes.faction_id] || '#666') + '40'}`,
                        }}
                      >
                        {FACTION_NAMES[deck.attributes.faction_id] || deck.attributes.faction_id}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {result.decks.map((d) => d.attributes.user_id).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {result.totalMissingCards > 0 ? (
                  <span className="text-sm text-yellow-400">
                    {result.totalMissingCards} missing card{result.totalMissingCards !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-sm text-green-400">Complete</span>
                )}
                <span className="text-gray-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Expanded details */}
            {isExpanded && (
              <div className="border-t border-white/10 p-4 space-y-4">
                {/* Deck cards */}
                {result.decks.map((deck, di) => {
                  const deckKey = `${globalIdx}-${di}`;
                  const isDeckExpanded = expandedDeck === deckKey;

                  return (
                    <div
                      key={di}
                      className="bg-black/20 rounded-lg border border-white/5 overflow-hidden"
                    >
                      <button
                        onClick={() => setExpandedDeck(isDeckExpanded ? null : deckKey)}
                        className="w-full p-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-1 h-8 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                FACTION_COLORS[deck.attributes.faction_id] || '#666',
                            }}
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">
                              {deck.attributes.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              by {deck.attributes.user_id} ·{' '}
                              {FACTION_NAMES[deck.attributes.faction_id] || deck.attributes.faction_id} ·{' '}
                              {deck.attributes.num_cards} cards
                            </div>
                          </div>
                        </div>
                        <span className="text-gray-500 text-xs ml-2 shrink-0">
                          {isDeckExpanded ? '▲' : '▼'}
                        </span>
                      </button>

                      {isDeckExpanded && (
                        <div className="border-t border-white/5 p-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                            {Object.entries(deck.attributes.card_slots)
                              .sort(([a], [b]) => {
                                const cardA = cardLookup.get(a);
                                const cardB = cardLookup.get(b);
                                const typeOrder = ['identity', 'program', 'hardware', 'resource', 'event', 'ice', 'asset', 'upgrade', 'operation', 'agenda'];
                                const typeA = typeOrder.indexOf(cardA?.attributes.card_type_id || '') ?? 99;
                                const typeB = typeOrder.indexOf(cardB?.attributes.card_type_id || '') ?? 99;
                                if (typeA !== typeB) return typeA - typeB;
                                return (cardTitles.get(a) || a).localeCompare(cardTitles.get(b) || b);
                              })
                              .map(([cardId, count]) => {
                                const isMissing = result.missingCards.some(
                                  (mc) => mc.cardId === cardId
                                );
                                return (
                                  <div
                                    key={cardId}
                                    className={`text-xs px-2 py-1 rounded flex justify-between ${
                                      isMissing
                                        ? 'bg-red-500/10 text-red-300'
                                        : 'text-gray-300'
                                    }`}
                                  >
                                    <span className="truncate">
                                      {cardTitles.get(cardId) || cardId}
                                    </span>
                                    <span className="ml-2 shrink-0 text-gray-500">×{count}</span>
                                  </div>
                                );
                              })}
                          </div>
                          <div className="mt-2 pt-2 border-t border-white/5">
                            <a
                              href={`https://netrunnerdb.com/en/decklist/${deck.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                            >
                              View on NetrunnerDB →
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Missing cards section */}
                {result.missingCards.length > 0 && (
                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-yellow-400 mb-3">
                      Missing Cards ({result.totalMissingCards} total copies)
                    </h4>
                    <div className="space-y-2">
                      {result.missingCards.map((mc) => (
                        <div
                          key={mc.cardId}
                          className="flex items-start justify-between text-sm"
                        >
                          <div className="min-w-0">
                            <div className="text-yellow-300 font-medium">{mc.cardTitle}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Need {mc.needed}, have {mc.available} (short {mc.shortfall})
                              {mc.requestedBy.length > 1 && (
                                <span className="ml-1">
                                  · Used by: {mc.requestedBy.join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-yellow-500 font-bold ml-2 shrink-0">
                            -{mc.shortfall}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-lg transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-400 px-4">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-lg transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
