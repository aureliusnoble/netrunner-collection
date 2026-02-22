import type { Decklist, DeckSetResult } from '../types';

export interface SavedPool {
  id: string;
  name: string;
  decklists: Decklist[];
  savedAt: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  results: DeckSetResult[];
  savedAt: number;
  resultCount: number;
}

const POOLS_KEY = 'nrdb_saved_pools';
const SEARCHES_KEY = 'nrdb_saved_searches';
const MAX_SAVED_SEARCHES = 20;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// === Pools ===

export function getSavedPools(): SavedPool[] {
  try {
    const raw = localStorage.getItem(POOLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePool(name: string, decklists: Decklist[]): SavedPool {
  const pools = getSavedPools();
  const pool: SavedPool = {
    id: generateId(),
    name,
    decklists,
    savedAt: Date.now(),
  };
  pools.unshift(pool);
  try {
    localStorage.setItem(POOLS_KEY, JSON.stringify(pools));
  } catch {
    // Storage full — drop oldest and retry
    pools.pop();
    try { localStorage.setItem(POOLS_KEY, JSON.stringify(pools)); } catch { /* give up */ }
  }
  return pool;
}

export function deletePool(id: string): void {
  const pools = getSavedPools().filter((p) => p.id !== id);
  localStorage.setItem(POOLS_KEY, JSON.stringify(pools));
}

// === Saved Searches ===

export function getSavedSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSearch(name: string, results: DeckSetResult[]): SavedSearch {
  const searches = getSavedSearches();
  const search: SavedSearch = {
    id: generateId(),
    name,
    results,
    savedAt: Date.now(),
    resultCount: results.length,
  };
  searches.unshift(search);
  while (searches.length > MAX_SAVED_SEARCHES) searches.pop();
  try {
    localStorage.setItem(SEARCHES_KEY, JSON.stringify(searches));
  } catch {
    // Storage full — drop oldest and retry
    searches.pop();
    try { localStorage.setItem(SEARCHES_KEY, JSON.stringify(searches)); } catch { /* give up */ }
  }
  return search;
}

export function deleteSavedSearch(id: string): void {
  const searches = getSavedSearches().filter((s) => s.id !== id);
  localStorage.setItem(SEARCHES_KEY, JSON.stringify(searches));
}

export function loadSavedSearch(id: string): SavedSearch | null {
  return getSavedSearches().find((s) => s.id === id) || null;
}
