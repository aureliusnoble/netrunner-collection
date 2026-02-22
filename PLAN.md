# Netrunner Deck Set Analyzer - Implementation Plan

## Architecture Overview
- **Framework**: Vite + React + TypeScript + Tailwind CSS
- **API**: NetrunnerDB v3 (api.netrunnerdb.com)
- **Deployment**: GitHub Pages (static SPA)
- **Algorithm**: Filtered brute force with pruning for deck set combinations

## Data Model

### Collection
- User selects NSG products they own + quantity (e.g., "System Gateway x1", "Elevation x2")
- Each product's cards/quantities come from the API's `printings` endpoint (`quantity` field per printing, `card_set_id` for product)
- User can manually add/remove individual cards
- Total collection = sum of (product cards * product copies) + manual additions

### Deck Search
- Side filter (Runner/Corp)
- Number of decks wanted (1-7)
- Faction constraints per deck slot (e.g., "one from each corp faction" or specific factions)
- Missing cards tolerance (0-N)
- Popularity filter (minimum favorites/comments threshold, or "all")

### Card Sets (from API)
Fetch from `/api/v3/public/card_sets` or `/api/v3/public/printings` to get:
- card_set_id → maps to purchasable products
- Each printing has `quantity` (copies in that set) and `card_id`
- deck_limit per card

## Pages/Views

### 1. Collection Setup (left panel / step 1)
- Dropdown/checklist of NSG products with quantity spinners
- Products grouped by cycle
- Manual card addition: search-as-you-type card selector with quantity
- Collection summary: total unique cards, total cards
- Persist to localStorage

### 2. Search Configuration (center / step 2)
- Runner vs Corp toggle
- Number of decks (1-7)
- Faction slots: for each deck slot, select faction (or "any")
- Missing cards allowed (0-10 slider)
- Minimum popularity filter (favorites count)
- "Search" button

### 3. Results View (step 3)
- List of valid deck set combinations
- Each combination shows:
  - The N decks with names, authors, links to NetrunnerDB
  - Cards in each deck
  - Shared cards between decks highlighted
  - Missing cards (if tolerance > 0) with:
    - Which cards are missing
    - How many copies needed vs available
    - Which decks in the set need them
- Sort results by: fewest missing cards, highest combined popularity, etc.

## API Integration

### Endpoints to use:
1. `GET /api/v3/public/card_sets` - Get all products/packs
2. `GET /api/v3/public/printings` - Get all cards with pack quantities (paginated)
3. `GET /api/v3/public/cards` - Card details (name, faction, side, deck_limit)
4. `GET /api/v3/public/decklists?filter[side_id]=corp&filter[faction_id]=haas_bioroid` - Fetch decklists
5. `GET /api/v3/public/factions` - Faction list
6. `GET /api/v3/public/sides` - Sides (runner/corp)

### Data Fetching Strategy:
- Fetch all printings + cards on app load (cache in localStorage with TTL)
- Fetch decklists on-demand per search, paginated
- Show loading progress

## Algorithm: Deck Set Finder

### Step 1: Pre-filter decklists
- Fetch all decklists matching side + faction criteria
- For each decklist, compute how many cards are NOT in collection
- Filter to decks with missing_count <= tolerance
- Sort by popularity (favorites), keep top N per faction (configurable, default 50)

### Step 2: Brute force combination search with pruning
```
For each combination of decks (one per faction slot):
  1. Sum up all card requirements across all decks in the set
  2. For each card, check if total_needed <= collection_available
  3. If any card exceeds collection, this combo is invalid
  4. Track missing cards if tolerance > 0
  5. If valid (missing <= tolerance), add to results

Pruning optimizations:
  - Sort faction slots by fewest candidates first
  - Early termination: if partial combo already exceeds tolerance, skip
  - Use a running card tally (add/subtract) instead of recomputing
```

### Step 3: Result ranking
- Sort valid sets by: missing card count (asc), then combined popularity (desc)
- Limit to top 100 results

## Implementation Steps

### Phase 1: Project Setup
1. Initialize Vite + React + TS project
2. Configure Tailwind CSS
3. Set up GitHub Pages deployment
4. Create basic app shell with routing/layout

### Phase 2: Data Layer
5. API client for NetrunnerDB v3
6. Fetch and cache card sets, printings, cards, factions
7. Collection state management (React context + localStorage)
8. Product → card mapping from printings data

### Phase 3: Collection UI
9. Product selector component
10. Manual card addition component
11. Collection summary/display

### Phase 4: Search & Algorithm
12. Search configuration UI
13. Decklist fetching with pagination
14. Deck pre-filtering (buildable from collection check)
15. Brute force combination finder with pruning
16. Web Worker for computation (keep UI responsive)

### Phase 5: Results UI
17. Deck set result cards
18. Card overlap visualization
19. Missing cards detail view
20. Sorting and pagination of results

### Phase 6: Polish
21. Loading states and progress indicators
22. Error handling
23. Responsive design
24. localStorage persistence
25. GitHub Pages deploy config
