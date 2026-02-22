import type {
  ApiResponse,
  Card,
  CardCycle,
  CardSet,
  Decklist,
  Faction,
  Printing,
  Side,
} from '../types';

// Try production first, then preview
const API_BASES = [
  'https://api.netrunnerdb.com/api/v3/public',
  'https://api-preview.netrunnerdb.com/api/v3/public',
];

let resolvedApiBase: string | null = null;

async function getApiBase(): Promise<string> {
  if (resolvedApiBase) return resolvedApiBase;

  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}/sides`, {
        headers: { Accept: 'application/vnd.api+json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        resolvedApiBase = base;
        return base;
      }
    } catch {
      // Try next
    }
  }

  // Default to first option
  resolvedApiBase = API_BASES[0];
  return resolvedApiBase;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`nrdb_cache_${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(`nrdb_cache_${key}`);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    localStorage.setItem(`nrdb_cache_${key}`, JSON.stringify(entry));
  } catch {
    // localStorage might be full; silently fail
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.api+json' },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function fetchAllPages<T extends { id: string }>(
  baseUrl: string,
  onProgress?: (loaded: number) => void
): Promise<T[]> {
  const allItems: T[] = [];
  let url: string | null = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page[limit]=100`;

  while (url) {
    const response: ApiResponse<T> = await fetchJson(url);
    allItems.push(...response.data);
    onProgress?.(allItems.length);
    url = response.links?.next || null;
  }

  return allItems;
}

export async function fetchSides(): Promise<Side[]> {
  const cached = getCached<Side[]>('sides');
  if (cached) return cached;

  const base = await getApiBase();
  const response: ApiResponse<Side> = await fetchJson(`${base}/sides`);
  setCache('sides', response.data);
  return response.data;
}

export async function fetchFactions(): Promise<Faction[]> {
  const cached = getCached<Faction[]>('factions');
  if (cached) return cached;

  const base = await getApiBase();
  const response: ApiResponse<Faction> = await fetchJson(`${base}/factions`);
  setCache('factions', response.data);
  return response.data;
}

export async function fetchCardSets(): Promise<CardSet[]> {
  const cached = getCached<CardSet[]>('card_sets');
  if (cached) return cached;

  const base = await getApiBase();
  const data = await fetchAllPages<CardSet>(`${base}/card_sets`);
  setCache('card_sets', data);
  return data;
}

export async function fetchCardCycles(): Promise<CardCycle[]> {
  const cached = getCached<CardCycle[]>('card_cycles');
  if (cached) return cached;

  const base = await getApiBase();
  const response: ApiResponse<CardCycle> = await fetchJson(`${base}/card_cycles`);
  setCache('card_cycles', response.data);
  return response.data;
}

export async function fetchCards(
  onProgress?: (loaded: number) => void
): Promise<Card[]> {
  const cached = getCached<Card[]>('cards');
  if (cached) return cached;

  const base = await getApiBase();
  const data = await fetchAllPages<Card>(`${base}/cards`, onProgress);
  setCache('cards', data);
  return data;
}

export async function fetchPrintings(
  onProgress?: (loaded: number) => void
): Promise<Printing[]> {
  const cached = getCached<Printing[]>('printings');
  if (cached) return cached;

  const base = await getApiBase();
  const data = await fetchAllPages<Printing>(`${base}/printings`, onProgress);
  setCache('printings', data);
  return data;
}

export async function fetchDecklists(
  filters: {
    sideId?: string;
    factionId?: string;
  },
  onProgress?: (loaded: number) => void
): Promise<Decklist[]> {
  const base = await getApiBase();
  const params = new URLSearchParams();
  if (filters.sideId) params.set('filter[side_id]', filters.sideId);
  if (filters.factionId) params.set('filter[faction_id]', filters.factionId);

  const url = `${base}/decklists?${params.toString()}`;
  return fetchAllPages<Decklist>(url, onProgress);
}

export function clearCache(): void {
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (key.startsWith('nrdb_cache_')) {
      localStorage.removeItem(key);
    }
  }
}
