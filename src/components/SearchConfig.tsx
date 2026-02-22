import { useState, useMemo, useCallback } from 'react';
import type { Decklist, Faction, SearchConfig as SearchConfigType, SearchProgress } from '../types';
import { FACTION_COLORS, FACTION_NAMES } from '../types';
import { fetchDecklist } from '../api/netrunnerdb';
import { getSavedPools, savePool, deletePool, type SavedPool } from '../store/savedData';
import { X, Loader2, Save, Plus } from 'lucide-react';

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
  const [customDecklists, setCustomDecklists] = useState<Decklist[]>([]);
  const [decklistInput, setDecklistInput] = useState('');
  const [isFetchingDecklist, setIsFetchingDecklist] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [savedPools, setSavedPools] = useState<SavedPool[]>(() => getSavedPools());
  const [poolNameInput, setPoolNameInput] = useState('');
  const [showSavePool, setShowSavePool] = useState(false);

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

  const parseDecklistId = (input: string): string | null => {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/decklist\/(\d+)/);
    if (urlMatch) return urlMatch[1];
    if (/^\d+$/.test(trimmed)) return trimmed;
    return null;
  };

  const handleAddDecklist = useCallback(async () => {
    const id = parseDecklistId(decklistInput);
    if (!id) {
      setFetchError('Invalid decklist URL or ID');
      return;
    }
    if (customDecklists.some((d) => d.id === id)) {
      setFetchError('Decklist already added');
      return;
    }
    setIsFetchingDecklist(true);
    setFetchError(null);
    try {
      const decklist = await fetchDecklist(id);
      setCustomDecklists((prev) => [...prev, decklist]);
      setDecklistInput('');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch decklist');
    } finally {
      setIsFetchingDecklist(false);
    }
  }, [decklistInput, customDecklists]);

  const removeDecklist = useCallback((id: string) => {
    setCustomDecklists((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleSavePool = useCallback(() => {
    const name = poolNameInput.trim();
    if (!name || customDecklists.length === 0) return;
    savePool(name, customDecklists);
    setSavedPools(getSavedPools());
    setPoolNameInput('');
    setShowSavePool(false);
  }, [poolNameInput, customDecklists]);

  const handleLoadPool = useCallback((pool: SavedPool) => {
    setCustomDecklists(pool.decklists);
  }, []);

  const handleDeletePool = useCallback((id: string) => {
    deletePool(id);
    setSavedPools(getSavedPools());
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
      customDecklists,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 sm:p-6">
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
                    className="w-full text-left px-3 py-2.5 sm:py-1.5 text-sm text-gray-300 hover:bg-white/10 transition-colors"
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
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs rounded-md"
                >
                  {a}
                  <button
                    onClick={() => removeAuthor(a)}
                    className="text-cyan-400/60 hover:text-cyan-300 ml-0.5 p-0.5"
                  >
                    <X size={12} />
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

        {/* Custom Decklist Pool */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Custom Decklist Pool <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Restrict search to specific decklists. Paste a NetrunnerDB decklist URL or ID.
          </p>
          {savedPools.length > 0 && (
            <div className="mb-3 space-y-1">
              <span className="text-xs text-gray-500 font-medium">Saved Pools:</span>
              <div className="flex flex-wrap gap-1.5">
                {savedPools.map((pool) => (
                  <span
                    key={pool.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-md text-xs"
                  >
                    <button
                      onClick={() => handleLoadPool(pool)}
                      className="text-purple-300 hover:text-purple-200 transition-colors"
                      title={`Load "${pool.name}" (${pool.decklists.length} decks)`}
                    >
                      {pool.name}
                      <span className="text-purple-500 ml-1">({pool.decklists.length})</span>
                    </button>
                    <button
                      onClick={() => handleDeletePool(pool.id)}
                      className="text-purple-500/50 hover:text-red-400 ml-0.5 p-0.5 transition-colors"
                      title="Delete saved pool"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://netrunnerdb.com/en/decklist/12345 or just 12345"
              value={decklistInput}
              onChange={(e) => {
                setDecklistInput(e.target.value);
                setFetchError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && decklistInput.trim()) {
                  e.preventDefault();
                  handleAddDecklist();
                }
              }}
              disabled={isFetchingDecklist}
              className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={handleAddDecklist}
              disabled={isFetchingDecklist || !decklistInput.trim()}
              className="px-4 py-2 bg-cyan-600/80 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isFetchingDecklist ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /><span className="hidden sm:inline ml-1">Add</span></>}
            </button>
          </div>
          {fetchError && (
            <p className="text-xs text-red-400 mt-1">{fetchError}</p>
          )}
          {customDecklists.length > 0 && (
            <div className="mt-3 space-y-1">
              {customDecklists.map((deck) => (
                <div
                  key={deck.id}
                  className="flex items-center justify-between px-3 py-2 bg-black/20 rounded-lg border border-white/5"
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftColor: FACTION_COLORS[deck.attributes.faction_id] || '#666',
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{deck.attributes.name}</div>
                    <div className="text-xs text-gray-500">
                      by {deck.attributes.user_id} ·{' '}
                      {FACTION_NAMES[deck.attributes.faction_id] || deck.attributes.faction_id} ·{' '}
                      ID {deck.id}
                    </div>
                  </div>
                  <button
                    onClick={() => removeDecklist(deck.id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 ml-1 shrink-0 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-2">
                {showSavePool ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="text"
                      placeholder="Pool name..."
                      value={poolNameInput}
                      onChange={(e) => setPoolNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleSavePool(); }
                        if (e.key === 'Escape') setShowSavePool(false);
                      }}
                      className="flex-1 px-2 py-1 bg-black/30 border border-white/10 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                      autoFocus
                    />
                    <button
                      onClick={handleSavePool}
                      disabled={!poolNameInput.trim()}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600/80 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-xs font-medium transition-colors"
                    >
                      <Save size={12} /> Save
                    </button>
                    <button
                      onClick={() => setShowSavePool(false)}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setShowSavePool(true)}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors px-1"
                    >
                      Save pool...
                    </button>
                    <span className="text-gray-600">·</span>
                    <button
                      onClick={() => setCustomDecklists([])}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1"
                    >
                      Clear all
                    </button>
                  </>
                )}
              </div>
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
              {customDecklists.length > 0
                ? `Search within ${customDecklists.length} Custom Decklist${customDecklists.length !== 1 ? 's' : ''}`
                : 'Search for Deck Sets'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
