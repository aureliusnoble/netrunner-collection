import { useState } from 'react';
import type { Card, DeckSetResult, SearchProgress } from '../types';
import { FACTION_COLORS, FACTION_NAMES } from '../types';

interface Props {
  results: DeckSetResult[];
  searchProgress: SearchProgress | null;
  isSearching: boolean;
  cardLookup: Map<string, Card>;
  cardTitles: Map<string, string>;
}

export function ResultsView({
  results,
  searchProgress,
  isSearching,
  cardLookup,
  cardTitles,
}: Props) {
  const [expandedSet, setExpandedSet] = useState<number | null>(null);
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const pagedResults = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(results.length / PAGE_SIZE);

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
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center justify-between">
        <div>
          <span className="text-sm text-gray-300">
            {searchProgress?.message || `${results.length} deck sets found`}
          </span>
        </div>
        {results.length > 0 && (
          <div className="text-sm text-gray-400">
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, results.length)} of{' '}
            {results.length}
          </div>
        )}
      </div>

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
              <div className="flex items-center gap-4">
                <span className="text-lg font-bold text-gray-500 w-8">#{globalIdx + 1}</span>
                <div className="flex gap-2">
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
