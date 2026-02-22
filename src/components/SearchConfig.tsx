import { useState, useMemo, useCallback } from 'react';
import type { Faction, SearchConfig as SearchConfigType, SearchProgress } from '../types';
import { FACTION_COLORS, FACTION_NAMES } from '../types';

interface Props {
  factions: Faction[];
  isSearching: boolean;
  onSearch: (config: SearchConfigType) => void;
  onCancel: () => void;
  searchProgress: SearchProgress | null;
  collectionEmpty: boolean;
  knownAuthors: string[];
}

export function SearchConfig({
  factions,
  isSearching,
  onSearch,
  onCancel,
  searchProgress,
  collectionEmpty,
  knownAuthors,
}: Props) {
  const [side, setSide] = useState<'runner' | 'corp'>('corp');
  const [numDecks, setNumDecks] = useState(4);
  const [factionSlots, setFactionSlots] = useState<string[]>([]);
  const [maxMissing, setMaxMissing] = useState(0);
  const [minPopularity] = useState(0);
  const [maxDecksPerFaction, setMaxDecksPerFaction] = useState(30);
  const [authors, setAuthors] = useState<string[]>([]);
  const [authorInput, setAuthorInput] = useState('');

  const sideFactions = useMemo(
    () =>
      factions
        .filter((f) => f.attributes.side_id === side && !f.attributes.is_mini)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [factions, side]
  );

  const effectiveSlots = useMemo(() => {
    const slots = [...factionSlots];
    while (slots.length < numDecks) slots.push('any');
    return slots.slice(0, numDecks);
  }, [factionSlots, numDecks]);

  const setSlot = (index: number, factionId: string) => {
    const newSlots = [...effectiveSlots];
    newSlots[index] = factionId;
    setFactionSlots(newSlots);
  };

  const autoFillOneEach = () => {
    const newSlots = sideFactions
      .filter((f) => !f.id.startsWith('neutral'))
      .slice(0, numDecks)
      .map((f) => f.id);
    while (newSlots.length < numDecks) newSlots.push('any');
    setFactionSlots(newSlots);
  };

  // Author suggestions filtered by current input
  const authorSuggestions = useMemo(() => {
    if (authorInput.length < 1) return [];
    const term = authorInput.toLowerCase();
    return knownAuthors
      .filter(
        (a) =>
          a.toLowerCase().includes(term) &&
          !authors.includes(a)
      )
      .slice(0, 8);
  }, [authorInput, knownAuthors, authors]);

  const addAuthor = useCallback((author: string) => {
    const trimmed = author.trim();
    if (trimmed && !authors.includes(trimmed)) {
      setAuthors((prev) => [...prev, trimmed]);
    }
    setAuthorInput('');
  }, [authors]);

  const removeAuthor = useCallback((author: string) => {
    setAuthors((prev) => prev.filter((a) => a !== author));
  }, []);

  const handleSearch = () => {
    onSearch({
      side,
      numDecks,
      factionSlots: effectiveSlots,
      maxMissingCards: maxMissing,
      minPopularity,
      maxDecksPerFaction,
      authors,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold mb-6 text-cyan-400">Search Configuration</h2>

        {collectionEmpty && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
            Your collection is empty. Go to the Collection tab first to add products you own.
          </div>
        )}

        {/* Side selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">Side</label>
          <div className="flex gap-2">
            {(['corp', 'runner'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSide(s);
                  setFactionSlots([]);
                }}
                className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-all ${
                  side === s
                    ? s === 'corp'
                      ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-400'
                      : 'bg-red-500/20 border-2 border-red-500 text-red-400'
                    : 'bg-white/5 border-2 border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                {s === 'corp' ? 'Corp' : 'Runner'}
              </button>
            ))}
          </div>
        </div>

        {/* Number of decks */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Number of Decks: <span className="text-cyan-400">{numDecks}</span>
          </label>
          <input
            type="range"
            min={1}
            max={7}
            value={numDecks}
            onChange={(e) => setNumDecks(parseInt(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>

        {/* Faction slots */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">Faction per Deck Slot</label>
            <button
              onClick={autoFillOneEach}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              One from each faction
            </button>
          </div>
          <div className="space-y-2">
            {effectiveSlots.map((slot, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-gray-500 w-16">Deck {i + 1}</span>
                <select
                  value={slot}
                  onChange={(e) => setSlot(i, e.target.value)}
                  className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftColor:
                      slot !== 'any' ? FACTION_COLORS[slot] || '#666' : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <option value="any">Any Faction</option>
                  {sideFactions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {FACTION_NAMES[f.id] || f.attributes.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Author filter */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Filter by Author <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Only include decklists by these authors. Leave empty to include all.
          </p>
          <div className="relative">
            <input
              type="text"
              placeholder="Type a NetrunnerDB username..."
              value={authorInput}
              onChange={(e) => setAuthorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && authorInput.trim()) {
                  e.preventDefault();
                  addAuthor(authorInput);
                }
              }}
              className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
            />
            {authorSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-gray-900 border border-white/10 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {authorSuggestions.map((a) => (
                  <button
                    key={a}
                    onClick={() => addAuthor(a)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 transition-colors"
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
          </div>
          {authors.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {authors.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs rounded-md"
                >
                  {a}
                  <button
                    onClick={() => removeAuthor(a)}
                    className="text-cyan-400/60 hover:text-cyan-300 ml-0.5"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <button
                onClick={() => setAuthors([])}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Missing cards tolerance */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Missing Cards Allowed: <span className="text-cyan-400">{maxMissing}</span>
          </label>
          <input
            type="range"
            min={0}
            max={50}
            value={maxMissing}
            onChange={(e) => setMaxMissing(parseInt(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Total missing card copies across ALL decks in a set
          </p>
        </div>

        {/* Max decks per faction (performance control) */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Max Decks per Faction: <span className="text-cyan-400">{maxDecksPerFaction}</span>
          </label>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={maxDecksPerFaction}
            onChange={(e) => setMaxDecksPerFaction(parseInt(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Limits candidates per faction. Higher = more thorough but slower.
            With {numDecks} decks at {maxDecksPerFaction}/faction, worst case ≈{' '}
            {Math.pow(maxDecksPerFaction, numDecks).toLocaleString()} combinations.
          </p>
        </div>

        {/* Search button */}
        <div className="pt-4 border-t border-white/10">
          {isSearching ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                <span className="text-sm text-gray-300">
                  {searchProgress?.message || 'Searching...'}
                </span>
              </div>
              {searchProgress && searchProgress.total > 0 && (
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (searchProgress.current / searchProgress.total) * 100)}%`,
                    }}
                  />
                </div>
              )}
              <button
                onClick={onCancel}
                className="w-full py-2 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-600/30 transition-colors"
              >
                Cancel Search
              </button>
            </div>
          ) : (
            <button
              onClick={handleSearch}
              disabled={collectionEmpty}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Search for Deck Sets
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
