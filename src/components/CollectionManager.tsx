import { useState, useMemo } from 'react';
import type { Card, CardCycle, CardPool, CardSet, Collection, Printing } from '../types';

interface Props {
  collection: Collection;
  cardSets: CardSet[];
  cardCycles: CardCycle[];
  cards: Card[];
  printings: Printing[];
  cardPool: CardPool;
  onAddProduct: (cardSetId: string, copies: number) => void;
  onRemoveProduct: (cardSetId: string) => void;
  onAddManualCard: (cardId: string, quantity: number) => void;
  onRemoveManualCard: (cardId: string) => void;
}

export function CollectionManager({
  collection,
  cardSets,
  cardCycles,
  cards,
  printings,
  cardPool,
  onAddProduct,
  onRemoveProduct,
  onAddManualCard,
  onRemoveManualCard,
}: Props) {
  const [manualSearch, setManualSearch] = useState('');
  const [manualQty, setManualQty] = useState(3);

  // Group card sets by cycle
  const cardSetsByCycle = useMemo(() => {
    const map = new Map<string, CardSet[]>();
    for (const cs of cardSets) {
      const cycleId = cs.attributes.card_cycle_id;
      if (!map.has(cycleId)) map.set(cycleId, []);
      map.get(cycleId)!.push(cs);
    }
    // Sort each group by position
    for (const sets of map.values()) {
      sets.sort((a, b) => a.attributes.position - b.attributes.position);
    }
    return map;
  }, [cardSets]);

  // Filter to NSG cycles + any other recognized cycles
  const sortedCycles = useMemo(() => {
    const cycles = cardCycles
      .filter((c) => {
        // Include NSG-era cycles and any cycle that has card sets
        return cardSetsByCycle.has(c.id) && (cardSetsByCycle.get(c.id)?.length ?? 0) > 0;
      })
      .sort((a, b) => a.attributes.position - b.attributes.position);
    return cycles;
  }, [cardCycles, cardSetsByCycle]);

  // Card search results for manual addition
  const manualSearchResults = useMemo(() => {
    if (manualSearch.length < 2) return [];
    const term = manualSearch.toLowerCase();
    return cards
      .filter((c) => c.attributes.title.toLowerCase().includes(term))
      .slice(0, 20);
  }, [cards, manualSearch]);

  // Count cards per set from printings
  const cardCountPerSet = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of printings) {
      const setId = p.attributes.card_set_id;
      map.set(setId, (map.get(setId) || 0) + 1);
    }
    return map;
  }, [printings]);

  const ownedMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of collection.ownedProducts) {
      map.set(p.cardSetId, p.copies);
    }
    return map;
  }, [collection.ownedProducts]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Product Selector */}
      <div className="lg:col-span-2">
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold mb-4 text-cyan-400">Card Products</h2>
          <p className="text-sm text-gray-400 mb-6">
            Select which NSG products you own and how many copies. Each product comes with full
            playsets (3x non-unique, 1x identities).
          </p>

          <div className="space-y-6">
            {sortedCycles.map((cycle) => {
              const sets = cardSetsByCycle.get(cycle.id) || [];
              if (sets.length === 0) return null;

              return (
                <div key={cycle.id} className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                    {cycle.attributes.name}
                  </h3>
                  <div className="space-y-1">
                    {sets.map((cs) => {
                      const owned = ownedMap.get(cs.id) || 0;
                      const cardCount = cardCountPerSet.get(cs.id) || 0;

                      return (
                        <div
                          key={cs.id}
                          className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                            owned > 0
                              ? 'bg-cyan-500/10 border border-cyan-500/30'
                              : 'bg-white/3 border border-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{cs.attributes.name}</div>
                            <div className="text-xs text-gray-500">
                              {cardCount} unique cards
                              {cs.attributes.date_release && ` · ${cs.attributes.date_release.slice(0, 4)}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={() => {
                                if (owned > 0) onAddProduct(cs.id, owned - 1);
                              }}
                              disabled={owned === 0}
                              className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold flex items-center justify-center transition-colors"
                            >
                              -
                            </button>
                            <span className={`w-6 text-center text-sm font-bold ${
                              owned > 0 ? 'text-cyan-400' : 'text-gray-600'
                            }`}>
                              {owned}
                            </span>
                            <button
                              onClick={() => onAddProduct(cs.id, owned + 1)}
                              className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-sm font-bold flex items-center justify-center transition-colors"
                            >
                              +
                            </button>
                            {owned > 0 && (
                              <button
                                onClick={() => onRemoveProduct(cs.id)}
                                className="ml-1 text-xs text-red-400 hover:text-red-300"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="space-y-6">
        {/* Collection Summary */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold mb-4 text-cyan-400">Collection Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-cyan-400">{cardPool.size}</div>
              <div className="text-xs text-gray-400 mt-1">Unique Cards</div>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-cyan-400">
                {Array.from(cardPool.values()).reduce((a, b) => a + b, 0)}
              </div>
              <div className="text-xs text-gray-400 mt-1">Total Cards</div>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-cyan-400">
                {collection.ownedProducts.length}
              </div>
              <div className="text-xs text-gray-400 mt-1">Products</div>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-cyan-400">
                {collection.manualCards.length}
              </div>
              <div className="text-xs text-gray-400 mt-1">Manual Cards</div>
            </div>
          </div>
        </div>

        {/* Manual Card Addition */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold mb-4 text-cyan-400">Add Individual Cards</h2>
          <p className="text-xs text-gray-400 mb-3">
            Add cards bought individually outside of collections.
          </p>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Search for a card..."
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
            />

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Qty:</label>
              <input
                type="number"
                min={1}
                max={6}
                value={manualQty}
                onChange={(e) => setManualQty(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 bg-black/30 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            {manualSearchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-1 bg-black/20 rounded-lg p-2">
                {manualSearchResults.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => {
                      onAddManualCard(card.id, manualQty);
                      setManualSearch('');
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-white/10 transition-colors"
                  >
                    <span className="text-white">{card.attributes.title}</span>
                    <span className="text-gray-500 ml-2 text-xs">{card.attributes.faction_id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manual cards list */}
          {collection.manualCards.length > 0 && (
            <div className="mt-4 space-y-1">
              <div className="text-xs text-gray-400 font-semibold mb-2">Added Cards:</div>
              {collection.manualCards.map((mc) => {
                const card = cards.find((c) => c.id === mc.cardId);
                return (
                  <div
                    key={mc.cardId}
                    className="flex items-center justify-between px-2 py-1 bg-black/20 rounded text-sm"
                  >
                    <span className="flex-1 truncate">
                      {card?.attributes.title || mc.cardId} ×{mc.quantity}
                    </span>
                    <button
                      onClick={() => onRemoveManualCard(mc.cardId)}
                      className="text-red-400 hover:text-red-300 text-xs ml-2"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
