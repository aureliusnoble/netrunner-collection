import { useState, useMemo, useCallback, useRef } from 'react';
import './App.css';
import { useAppData, useCollection, computeCardPool, useCardLookup } from './store/useAppStore';
import { CollectionManager } from './components/CollectionManager';
import { SearchConfig } from './components/SearchConfig';
import { ResultsView } from './components/ResultsView';
import { LoadingScreen } from './components/LoadingScreen';
import { fetchDecklists, clearCache } from './api/netrunnerdb';
import { preFilterDecks, findDeckSets } from './utils/deckSetFinder';
import type { SearchConfig as SearchConfigType, DeckSetResult, SearchProgress, Decklist } from './types';

type Tab = 'collection' | 'search' | 'results';

function App() {
  const appData = useAppData();
  const { collection, addProduct, removeProduct, addManualCard, removeManualCard } = useCollection();
  const cardLookup = useCardLookup(appData.cards);

  const [activeTab, setActiveTab] = useState<Tab>('collection');
  const [results, setResults] = useState<DeckSetResult[]>([]);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [knownAuthors, setKnownAuthors] = useState<string[]>([]);
  const [totalCandidateDecks, setTotalCandidateDecks] = useState(0);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const cardPool = useMemo(
    () => computeCardPool(collection, appData.printings),
    [collection, appData.printings]
  );

  const cardTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of appData.cards) {
      map.set(c.id, c.attributes.title);
    }
    return map;
  }, [appData.cards]);

  const runSearch = useCallback(
    async (config: SearchConfigType) => {
      abortRef.current = { aborted: false };
      setIsSearching(true);
      setResults([]);
      setActiveTab('results');

      try {
        // Determine which factions to fetch
        const factionSlots = config.factionSlots.slice(0, config.numDecks);
        const uniqueFactions = [...new Set(factionSlots.filter((f) => f !== 'any'))];
        const needsAllFactions = factionSlots.includes('any');

        // Get all factions for this side
        const sideFactions = appData.factions
          .filter((f) => f.attributes.side_id === config.side && !f.attributes.is_mini)
          .map((f) => f.id);

        const factionsToFetch = needsAllFactions
          ? sideFactions
          : uniqueFactions.length > 0
            ? uniqueFactions
            : sideFactions;

        // Fetch decklists for each faction
        const decksByFaction = new Map<string, Decklist[]>();
        let totalFetched = 0;

        for (const factionId of factionsToFetch) {
          if (abortRef.current.aborted) return;

          setSearchProgress({
            phase: 'fetching',
            message: `Fetching ${factionId} decklists...`,
            current: totalFetched,
            total: 0,
          });

          const decks = await fetchDecklists(
            { sideId: config.side, factionId },
            (n) => {
              setSearchProgress({
                phase: 'fetching',
                message: `Fetching ${factionId} decklists... (${n})`,
                current: totalFetched + n,
                total: 0,
              });
            }
          );
          totalFetched += decks.length;
          decksByFaction.set(factionId, decks);
        }

        if (abortRef.current.aborted) return;

        // Collect known authors for prefill suggestions
        const allAuthors = new Set<string>();
        for (const decks of decksByFaction.values()) {
          for (const d of decks) {
            allAuthors.add(d.attributes.user_id);
          }
        }
        setKnownAuthors((prev) => {
          const merged = new Set([...prev, ...allAuthors]);
          return [...merged].sort();
        });

        // Filter by author if specified
        const authorFilter = config.authors.length > 0
          ? new Set(config.authors.map((a) => a.toLowerCase()))
          : null;

        // Pre-filter each faction's decks
        let authorMatchCount = 0;
        const filteredByFaction = new Map<string, Decklist[]>();
        for (const [factionId, decks] of decksByFaction) {
          let candidates = decks;
          if (authorFilter) {
            candidates = candidates.filter((d) => {
              const uid = d.attributes.user_id;
              return uid != null && authorFilter.has(uid.toLowerCase());
            });
            authorMatchCount += candidates.length;
          }

          setSearchProgress({
            phase: 'filtering',
            message: authorFilter
              ? `Filtering ${factionId} decks (${candidates.length} by ${config.authors.join(', ')})...`
              : `Pre-filtering ${factionId} decks against your collection...`,
            current: 0,
            total: totalFetched,
          });

          const filtered = preFilterDecks(candidates, cardPool, config.maxMissingCards);
          const limited = filtered.slice(0, config.maxDecksPerFaction);
          filteredByFaction.set(factionId, limited);
        }

        if (authorFilter) {
          console.log(
            `[Author filter] Matched ${authorMatchCount}/${totalFetched} decks for authors: ${config.authors.join(', ')}`
          );
        }

        // Build faction buckets for the combination search
        const buckets: { factionId: string; decks: Decklist[] }[] = [];

        for (let i = 0; i < config.numDecks; i++) {
          const slot = factionSlots[i];
          if (slot === 'any') {
            // Combine all factions for this slot
            const allDecks: Decklist[] = [];
            for (const decks of filteredByFaction.values()) {
              allDecks.push(...decks);
            }
            buckets.push({ factionId: 'any', decks: allDecks });
          } else {
            const decks = filteredByFaction.get(slot) || [];
            buckets.push({ factionId: slot, decks });
          }
        }

        // Count total unique candidate decks across all buckets
        const allCandidateIds = new Set<string>();
        for (const b of buckets) {
          for (const d of b.decks) allCandidateIds.add(d.id);
        }
        setTotalCandidateDecks(allCandidateIds.size);

        // Check we have decks in all slots
        const emptySlots = buckets.filter((b) => b.decks.length === 0);
        if (emptySlots.length > 0) {
          setSearchProgress({
            phase: 'done',
            message: `No matching decks found for some faction slots. Try increasing missing card tolerance or adding more products to your collection.`,
            current: 0,
            total: 0,
          });
          setIsSearching(false);
          return;
        }

        // Run brute force combination search
        setSearchProgress({
          phase: 'combining',
          message: 'Finding valid deck sets...',
          current: 0,
          total: 0,
        });

        // Use setTimeout to avoid blocking UI
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            const found = findDeckSets(
              buckets,
              cardPool,
              config.maxMissingCards,
              cardTitles,
              setSearchProgress,
              abortRef.current
            );
            setResults(found);
            setSearchProgress({
              phase: 'done',
              message: `Found ${found.length} valid deck set${found.length !== 1 ? 's' : ''}`,
              current: found.length,
              total: found.length,
            });
            resolve();
          }, 50);
        });
      } catch (err) {
        setSearchProgress({
          phase: 'done',
          message: `Search error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          current: 0,
          total: 0,
        });
      } finally {
        setIsSearching(false);
      }
    },
    [appData.factions, cardPool, cardTitles]
  );

  const cancelSearch = useCallback(() => {
    abortRef.current.aborted = true;
    setIsSearching(false);
    setSearchProgress({
      phase: 'done',
      message: 'Search cancelled.',
      current: 0,
      total: 0,
    });
  }, []);

  if (appData.loading) {
    return <LoadingScreen message={appData.loadingMessage} />;
  }

  if (appData.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-8 max-w-lg text-center">
          <h2 className="text-xl font-bold text-red-400 mb-4">Failed to Load Data</h2>
          <p className="text-red-300 mb-4">{appData.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const collectionSize = cardPool.size;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ fontFamily: 'Orbitron, sans-serif' }}>
            <span className="text-cyan-400">NET</span>
            <span className="text-white">RUNNER</span>
            <span className="text-gray-500 ml-2 text-sm font-normal" style={{ fontFamily: 'Inter, sans-serif' }}>
              Deck Set Analyzer
            </span>
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              Collection: <span className="text-cyan-400 font-medium">{collectionSize}</span> unique cards
            </span>
            <button
              onClick={() => {
                clearCache();
                window.location.reload();
              }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              title="Clear cached API data and reload"
            >
              Refresh Data
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-white/10 bg-black/10">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {([
            { id: 'collection' as Tab, label: 'Collection', icon: '📦' },
            { id: 'search' as Tab, label: 'Search', icon: '🔍' },
            { id: 'results' as Tab, label: 'Results', icon: '📊', badge: results.length || undefined },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-cyan-400 border-b-2 border-cyan-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
              {tab.badge !== undefined && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-cyan-500/20 text-cyan-400 rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4">
        <div style={{ display: activeTab === 'collection' ? 'block' : 'none' }}>
          <CollectionManager
            collection={collection}
            cardSets={appData.cardSets}
            cardCycles={appData.cardCycles}
            cards={appData.cards}
            printings={appData.printings}
            cardPool={cardPool}
            onAddProduct={addProduct}
            onRemoveProduct={removeProduct}
            onAddManualCard={addManualCard}
            onRemoveManualCard={removeManualCard}
          />
        </div>
        <div style={{ display: activeTab === 'search' ? 'block' : 'none' }}>
          <SearchConfig
            factions={appData.factions}
            isSearching={isSearching}
            onSearch={runSearch}
            onCancel={cancelSearch}
            searchProgress={searchProgress}
            collectionEmpty={collectionSize === 0}
            knownAuthors={knownAuthors}
          />
        </div>
        <div style={{ display: activeTab === 'results' ? 'block' : 'none' }}>
          <ResultsView
            results={results}
            searchProgress={searchProgress}
            isSearching={isSearching}
            cardLookup={cardLookup}
            cardTitles={cardTitles}
            totalCandidateDecks={totalCandidateDecks}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
