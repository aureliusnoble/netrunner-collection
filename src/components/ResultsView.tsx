import { useState, useMemo, useCallback } from 'react';
import type { Card, DeckSetResult, SearchProgress } from '../types';
import { FACTION_COLORS, FACTION_NAMES } from '../types';
import {
  getSavedSearches,
  saveSearch,
  deleteSavedSearch,
  type SavedSearch,
} from '../store/savedData';
import { BarChart3, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X, ExternalLink, Save } from 'lucide-react';

interface Props {
  results: DeckSetResult[];
  searchProgress: SearchProgress | null;
  isSearching: boolean;
  cardLookup: Map<string, Card>;
  cardTitles: Map<string, string>;
  totalCandidateDecks: number;
  onLoadResults: (results: DeckSetResult[]) => void;
}

export function ResultsView({
  results,
  searchProgress,
  isSearching,
  cardLookup,
  cardTitles,
  totalCandidateDecks,
  onLoadResults,
}: Props) {
  const [expandedSet, setExpandedSet] = useState<number | null>(null);
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);
  const [expandedSummary, setExpandedSummary] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => getSavedSearches());
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [expandedSaved, setExpandedSaved] = useState(false);

  const handleSaveSearch = useCallback(() => {
    const name = saveNameInput.trim();
    if (!name || results.length === 0) return;
    saveSearch(name, results);
    setSavedSearches(getSavedSearches());
    setSaveNameInput('');
    setShowSaveForm(false);
  }, [saveNameInput, results]);

  const handleLoadSearch = useCallback((search: SavedSearch) => {
    onLoadResults(search.results);
    setExpandedSaved(false);
    setPage(0);
    setExpandedSet(null);
  }, [onLoadResults]);

  const handleDeleteSearch = useCallback((id: string) => {
    deleteSavedSearch(id);
    setSavedSearches(getSavedSearches());
  }, []);

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
      <div className="space-y-8">
        <div className="text-center py-12">
          <div className="mb-4 opacity-30 flex justify-center"><BarChart3 size={64} /></div>
          <h2 className="text-xl font-semibold text-gray-400 mb-2">No Results Yet</h2>
          <p className="text-gray-500">Configure a search in the Search tab to find deck sets.</p>
        </div>
        {savedSearches.length > 0 && (
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-purple-400 mb-3">Saved Searches</h3>
            <div className="space-y-1.5">
              {savedSearches.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 bg-black/20 rounded-lg border border-white/5"
                >
                  <button
                    onClick={() => handleLoadSearch(s)}
                    className="min-w-0 text-left hover:text-purple-300 transition-colors"
                  >
                    <div className="text-sm text-white truncate">{s.name}</div>
                    <div className="text-xs text-gray-500">
                      {s.resultCount} deck set{s.resultCount !== 1 ? 's' : ''} ·{' '}
                      {new Date(s.savedAt).toLocaleDateString()}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteSearch(s.id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 ml-1 shrink-0 transition-colors"
                    title="Delete saved search"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-sm text-gray-300">
            {searchProgress?.message || `${results.length} deck sets found`}
          </span>
          {results.length > 0 && (
            <div className="text-xs sm:text-sm text-gray-400 shrink-0">
              {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, results.length)} of{' '}
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
        {/* Save & Load controls */}
        {results.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-3">
            {showSaveForm ? (
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="text"
                  placeholder="Name this search..."
                  value={saveNameInput}
                  onChange={(e) => setSaveNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleSaveSearch(); }
                    if (e.key === 'Escape') setShowSaveForm(false);
                  }}
                  className="flex-1 px-2 py-1 bg-black/30 border border-white/10 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                  autoFocus
                />
                <button
                  onClick={handleSaveSearch}
                  disabled={!saveNameInput.trim()}
                  className="px-2 py-1 bg-purple-600/80 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-xs font-medium transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowSaveForm(false)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowSaveForm(true)}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <Save size={12} /> Save results...
                </button>
                {savedSearches.length > 0 && (
                  <>
                    <span className="text-gray-600">·</span>
                    <button
                      onClick={() => setExpandedSaved(!expandedSaved)}
                      className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                    >
                      Saved searches ({savedSearches.length}) {expandedSaved ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {expandedSaved && savedSearches.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/5 space-y-1.5">
            {savedSearches.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-3 py-2 bg-black/20 rounded-lg border border-white/5"
              >
                <button
                  onClick={() => handleLoadSearch(s)}
                  className="min-w-0 text-left hover:text-purple-300 transition-colors"
                >
                  <div className="text-sm text-white truncate">{s.name}</div>
                  <div className="text-xs text-gray-500">
                    {s.resultCount} deck set{s.resultCount !== 1 ? 's' : ''} ·{' '}
                    {new Date(s.savedAt).toLocaleDateString()}
                  </div>
                </button>
                <button
                  onClick={() => handleDeleteSearch(s.id)}
                  className="p-1.5 text-gray-500 hover:text-red-400 ml-2 shrink-0 transition-colors"
                  title="Delete saved search"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
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
            <span className="text-gray-500">{expandedSummary ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>

          {expandedSummary && (
            <div className="border-t border-yellow-500/10 p-4">
              <div className="text-xs text-gray-500 mb-3 grid grid-cols-[1fr_55px_55px_55px] sm:grid-cols-[1fr_80px_80px_80px] gap-1.5 sm:gap-2 font-semibold uppercase tracking-wider">
                <span>Card</span>
                <span className="text-right">Max Missing</span>
                <span className="text-right">Sets Need</span>
                <span className="text-right">% of Sets</span>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {aggregateMissing.map((mc) => (
                  <div
                    key={mc.cardId}
                    className="grid grid-cols-[1fr_55px_55px_55px] sm:grid-cols-[1fr_80px_80px_80px] gap-1.5 sm:gap-2 text-sm py-1 px-1 rounded hover:bg-white/5"
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
                <span className="text-gray-500">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
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
                        <span className="text-gray-500 ml-2 shrink-0">
                          {isDeckExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
                              View on NetrunnerDB <ExternalLink size={12} className="inline ml-1" />
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
            className="flex items-center gap-1.5 px-4 py-2.5 sm:py-2 text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-lg transition-colors"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Previous</span>
          </button>
          <span className="text-sm text-gray-400 px-4">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1.5 px-4 py-2.5 sm:py-2 text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-lg transition-colors"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
