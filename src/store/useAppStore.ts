import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Card,
  CardCycle,
  CardPool,
  CardSet,
  Collection,
  Faction,
  ManualCard,
  OwnedProduct,
  Printing,
} from '../types';
import {
  fetchCardCycles,
  fetchCards,
  fetchCardSets,
  fetchFactions,
  fetchPrintings,
} from '../api/netrunnerdb';

const COLLECTION_KEY = 'nrdb_collection';

function loadCollection(): Collection {
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { ownedProducts: [], manualCards: [] };
}

function saveCollection(collection: Collection) {
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
}

export interface AppData {
  cards: Card[];
  cardSets: CardSet[];
  cardCycles: CardCycle[];
  printings: Printing[];
  factions: Faction[];
  loading: boolean;
  loadingMessage: string;
  error: string | null;
}

export function useAppData(): AppData {
  const [cards, setCards] = useState<Card[]>([]);
  const [cardSets, setCardSets] = useState<CardSet[]>([]);
  const [cardCycles, setCardCycles] = useState<CardCycle[]>([]);
  const [printings, setPrintings] = useState<Printing[]>([]);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadingMessage('Loading factions...');
        const [factionsData, cardCyclesData] = await Promise.all([
          fetchFactions(),
          fetchCardCycles(),
        ]);
        if (cancelled) return;
        setFactions(factionsData);
        setCardCycles(cardCyclesData);

        setLoadingMessage('Loading card sets...');
        const cardSetsData = await fetchCardSets();
        if (cancelled) return;
        setCardSets(cardSetsData);

        setLoadingMessage('Loading cards...');
        const cardsData = await fetchCards((n) => {
          if (!cancelled) setLoadingMessage(`Loading cards... (${n})`);
        });
        if (cancelled) return;
        setCards(cardsData);

        setLoadingMessage('Loading printings...');
        const printingsData = await fetchPrintings((n) => {
          if (!cancelled) setLoadingMessage(`Loading printings... (${n})`);
        });
        if (cancelled) return;
        setPrintings(printingsData);

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { cards, cardSets, cardCycles, printings, factions, loading, loadingMessage, error };
}

export function useCollection() {
  const [collection, setCollectionState] = useState<Collection>(loadCollection);

  const setCollection = useCallback((c: Collection) => {
    setCollectionState(c);
    saveCollection(c);
  }, []);

  const addProduct = useCallback((cardSetId: string, copies: number) => {
    setCollectionState((prev) => {
      const existing = prev.ownedProducts.find((p) => p.cardSetId === cardSetId);
      let newProducts: OwnedProduct[];
      if (existing) {
        newProducts = prev.ownedProducts.map((p) =>
          p.cardSetId === cardSetId ? { ...p, copies } : p
        );
      } else {
        newProducts = [...prev.ownedProducts, { cardSetId, copies }];
      }
      if (copies <= 0) {
        newProducts = newProducts.filter((p) => p.cardSetId !== cardSetId);
      }
      const next = { ...prev, ownedProducts: newProducts };
      saveCollection(next);
      return next;
    });
  }, []);

  const removeProduct = useCallback((cardSetId: string) => {
    setCollectionState((prev) => {
      const next = {
        ...prev,
        ownedProducts: prev.ownedProducts.filter((p) => p.cardSetId !== cardSetId),
      };
      saveCollection(next);
      return next;
    });
  }, []);

  const addManualCard = useCallback((cardId: string, quantity: number) => {
    setCollectionState((prev) => {
      const existing = prev.manualCards.find((c) => c.cardId === cardId);
      let newManual: ManualCard[];
      if (existing) {
        newManual = prev.manualCards.map((c) =>
          c.cardId === cardId ? { ...c, quantity } : c
        );
      } else {
        newManual = [...prev.manualCards, { cardId, quantity }];
      }
      if (quantity <= 0) {
        newManual = newManual.filter((c) => c.cardId !== cardId);
      }
      const next = { ...prev, manualCards: newManual };
      saveCollection(next);
      return next;
    });
  }, []);

  const removeManualCard = useCallback((cardId: string) => {
    setCollectionState((prev) => {
      const next = {
        ...prev,
        manualCards: prev.manualCards.filter((c) => c.cardId !== cardId),
      };
      saveCollection(next);
      return next;
    });
  }, []);

  return {
    collection,
    setCollection,
    addProduct,
    removeProduct,
    addManualCard,
    removeManualCard,
  };
}

/** Given owned products + printings, compute total card pool */
export function computeCardPool(
  collection: Collection,
  printings: Printing[]
): CardPool {
  const pool: CardPool = new Map();

  // Group printings by card_set_id
  const printingsBySet = new Map<string, Printing[]>();
  for (const p of printings) {
    const setId = p.attributes.card_set_id;
    if (!printingsBySet.has(setId)) printingsBySet.set(setId, []);
    printingsBySet.get(setId)!.push(p);
  }

  // For each owned product, add card quantities
  for (const owned of collection.ownedProducts) {
    const setPrintings = printingsBySet.get(owned.cardSetId) || [];
    for (const p of setPrintings) {
      const cardId = p.attributes.card_id;
      const qty = p.attributes.quantity * owned.copies;
      pool.set(cardId, (pool.get(cardId) || 0) + qty);
    }
  }

  // Add manual cards
  for (const mc of collection.manualCards) {
    pool.set(mc.cardId, (pool.get(mc.cardId) || 0) + mc.quantity);
  }

  return pool;
}

/** Build a lookup: cardId → Card */
export function useCardLookup(cards: Card[]): Map<string, Card> {
  return useMemo(() => {
    const map = new Map<string, Card>();
    for (const c of cards) {
      map.set(c.id, c);
    }
    return map;
  }, [cards]);
}
