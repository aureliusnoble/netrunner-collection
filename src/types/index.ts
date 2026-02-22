// === NetrunnerDB API v3 Types ===

export interface ApiResponse<T> {
  data: T[];
  links?: {
    self: string;
    first?: string;
    prev?: string;
    next?: string;
    last?: string;
  };
  meta?: {
    total?: number;
  };
}

export interface CardSet {
  id: string;
  type: 'card_sets';
  attributes: {
    name: string;
    date_release: string | null;
    size: number;
    card_cycle_id: string;
    card_set_type_id: string;
    position: number;
    updated_at: string;
  };
}

export interface CardCycle {
  id: string;
  type: 'card_cycles';
  attributes: {
    name: string;
    position: number;
    card_set_ids: string[];
    updated_at: string;
  };
}

export interface Printing {
  id: string;
  type: 'printings';
  attributes: {
    card_id: string;
    card_set_id: string;
    card_cycle_id: string;
    card_set_name: string;
    card_cycle_name: string;
    title: string;
    stripped_title: string;
    position: number;
    quantity: number;
    deck_limit: number;
    faction_id: string;
    side_id: string;
    card_type_id: string;
    influence_cost: number | null;
    cost: number | null;
    strength: number | null;
    text?: string;
    is_unique: boolean;
    date_release: string | null;
    card_subtype_ids?: string[];
  };
}

export interface Card {
  id: string;
  type: 'cards';
  attributes: {
    title: string;
    stripped_title: string;
    card_type_id: string;
    side_id: string;
    faction_id: string;
    deck_limit: number;
    influence_cost: number | null;
    is_unique: boolean;
    cost: number | null;
    strength: number | null;
    text?: string;
    card_subtype_ids?: string[];
  };
}

export interface Faction {
  id: string;
  type: 'factions';
  attributes: {
    name: string;
    side_id: string;
    is_mini: boolean;
    updated_at: string;
  };
}

export interface Side {
  id: string;
  type: 'sides';
  attributes: {
    name: string;
    updated_at: string;
  };
}

export interface Decklist {
  id: string;
  type: 'decklists';
  attributes: {
    user_id: string;
    follows_basic_deckbuilding_rules: boolean;
    identity_card_id: string;
    name: string;
    notes: string;
    tags: string[];
    side_id: string;
    faction_id: string;
    created_at: string;
    updated_at: string;
    card_slots: Record<string, number>;
    num_cards: number;
    influence_spent: number;
  };
}

// === App-specific types ===

export interface OwnedProduct {
  cardSetId: string;
  copies: number;
}

export interface ManualCard {
  cardId: string;
  quantity: number;
}

export interface Collection {
  ownedProducts: OwnedProduct[];
  manualCards: ManualCard[];
}

/** Computed: how many copies of each card the user has */
export type CardPool = Map<string, number>;

export interface SearchConfig {
  side: 'runner' | 'corp';
  numDecks: number;
  factionSlots: (string | 'any')[];
  maxMissingCards: number;
  minPopularity: number;
  maxDecksPerFaction: number;
  authors: string[];
  customDecklists: Decklist[];
}

export interface MissingCardInfo {
  cardId: string;
  cardTitle: string;
  needed: number;
  available: number;
  shortfall: number;
  requestedBy: string[]; // deck names
}

export interface DeckSetResult {
  decks: Decklist[];
  totalMissingCards: number;
  missingCards: MissingCardInfo[];
  combinedPopularity: number;
}

export interface SearchProgress {
  phase: 'fetching' | 'filtering' | 'combining' | 'done';
  message: string;
  current: number;
  total: number;
}

// For the faction colors
export const FACTION_COLORS: Record<string, string> = {
  anarch: '#ff6600',
  criminal: '#3b82f6',
  shaper: '#10b981',
  apex: '#8b5cf6',
  adam: '#f59e0b',
  sunny_lebeau: '#f97316',
  neutral_runner: '#9ca3af',
  haas_bioroid: '#8b5cf6',
  jinteki: '#ef4444',
  nbn: '#f59e0b',
  weyland_consortium: '#10b981',
  neutral_corp: '#9ca3af',
};

export const FACTION_NAMES: Record<string, string> = {
  anarch: 'Anarch',
  criminal: 'Criminal',
  shaper: 'Shaper',
  apex: 'Apex',
  adam: 'Adam',
  sunny_lebeau: 'Sunny Lebeau',
  neutral_runner: 'Neutral',
  haas_bioroid: 'Haas-Bioroid',
  jinteki: 'Jinteki',
  nbn: 'NBN',
  weyland_consortium: 'Weyland',
  neutral_corp: 'Neutral',
};
