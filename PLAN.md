# Export Cards for Printing - Implementation Plan

## Overview
Add a feature that exports missing cards as JPG images in a downloadable zip file, for proxy printing purposes. The export includes one JPG per copy needed (based on shortfall), organized in a Runner or Corp subfolder, plus an optional user-provided card back image.

## Key Design Decisions
- **Card backs**: User uploads their own image (NSG does not distribute card backs publicly)
- **Export scope**: Export buttons on both individual result sets AND the aggregate missing cards summary
- **Image source**: Use the most recently released printing of each card for the image URL
- **Image URL format**: `https://card-images.netrunnerdb.com/v2/large/{printing_id}.jpg`
- **Zip library**: Use `jszip` (popular, well-maintained, works in-browser)
- **File saving**: Use native `URL.createObjectURL` + click-to-download pattern (no extra dependency)

## Zip File Structure
```
export.zip
├── card_back.jpg              (user-provided card back, if uploaded)
└── runner/                    (or corp/, based on search side)
    ├── 0001_{card_id}_{card_name}.jpg
    ├── 0002_{card_id}_{card_name}.jpg
    ├── 0003_{card_id}_{card_name}.jpg   (e.g., if 3 copies missing)
    └── ...
```

## Implementation Steps

### Step 1: Install Dependencies
- `npm install jszip` — for creating zip files in-browser
- `npm install -D @types/jszip` — TypeScript types (if needed; jszip ships its own types)

### Step 2: Create Card-to-Printing Mapping Utility (`src/utils/cardPrintings.ts`)
Create a utility to resolve `card_id` → latest `printing_id`:
- Takes the full printings array (already loaded and cached by the app)
- Groups printings by `card_id`
- For each card, selects the printing with the latest `date_release` (or highest `position` as tiebreaker)
- Returns a `Map<string, string>` of `card_id` → `printing_id`
- Also export a helper: `getCardImageUrl(printingId: string): string` that returns the image URL

### Step 3: Create Export Utility (`src/utils/exportCards.ts`)
Core export logic:

```typescript
interface ExportCard {
  cardId: string;
  cardTitle: string;
  shortfall: number;  // number of copies to generate
}

interface ExportOptions {
  cards: ExportCard[];
  side: 'runner' | 'corp';
  cardBackBlob: Blob | null;
  cardToPrintingId: Map<string, string>;
  onProgress: (message: string, current: number, total: number) => void;
}

async function exportCardsAsZip(options: ExportOptions): Promise<Blob>
```

Logic:
1. Calculate total images needed (sum of all shortfalls)
2. Create a JSZip instance
3. If `cardBackBlob` is provided, add it as `card_back.jpg` at root
4. Create the side subfolder (`runner/` or `corp/`)
5. For each card, for each copy (1..shortfall):
   - Resolve `card_id` → `printing_id` via the mapping
   - Fetch image from `https://card-images.netrunnerdb.com/v2/large/{printingId}.jpg`
   - Sanitize card name for filename (remove special chars, replace spaces with underscores)
   - Name: `{0001-padded number}_{card_id}_{sanitized_name}.jpg`
   - Add to zip under the side folder
   - Report progress
6. Generate the zip blob and return it
7. Handle fetch errors gracefully (skip cards with missing images, log warnings)

Rate limiting / batching:
- Download images in batches of 5 concurrent requests to avoid overwhelming the server
- Show progress updates as images are downloaded
- Cache fetched image blobs so duplicate card copies don't re-fetch

### Step 4: Create Export Modal Component (`src/components/ExportModal.tsx`)
A modal dialog that handles the entire export flow:
- **Pre-export state**: Shows summary (N unique cards, M total copies to download), card back upload area (optional with preview), "Download Zip" button
- **Exporting state**: Progress bar with "Downloading card images... (X/Y)", cancel button
- **Complete state**: Auto-triggers zip download, shows success message, any failed images listed
- Card back upload: file input accepting `.jpg/.jpeg/.png/.webp`, thumbnail preview, remove button
- Styled to match existing dark theme (dark modal overlay, cyan/purple accents)

### Step 5: Add Export Buttons to ResultsView (`src/components/ResultsView.tsx`)
Two export entry points:

**A) Aggregate Missing Cards Summary section:**
- Add "Export for Printing" button below the summary table
- Uses `aggregateMissing` data with `maxShortfall` per card
- Opens the ExportModal

**B) Per-Result Missing Cards section:**
- Add "Export for Printing" button in each result set's missing cards area
- Uses that result's `missingCards` array (each `MissingCardInfo` has `shortfall`)
- Opens the ExportModal

Both buttons determine `side` from the deck data (all decks in a result share the same `side_id`).

### Step 6: Wire Up Data Flow in App.tsx
- Pass `printings` array from `App.tsx` to `ResultsView` (currently not passed)
- Compute `cardToPrintingId` mapping via `useMemo` in `ResultsView` or pass pre-computed from App
- The ExportModal receives: cards to export, side, and the printing mapping

### Step 7: Add ExportModal state management in ResultsView
- State: `exportModalOpen: boolean`, `exportCards: ExportCard[]`, `exportSide: string`
- Opening either export button populates these and opens the modal
- Modal handles its own card back state and progress internally

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `package.json` | MODIFY | Add `jszip` dependency |
| `src/utils/cardPrintings.ts` | NEW | Card ID → Printing ID mapping utility |
| `src/utils/exportCards.ts` | NEW | Core zip generation and image download logic |
| `src/components/ExportModal.tsx` | NEW | Modal with card back upload, progress bar, download trigger |
| `src/components/ResultsView.tsx` | MODIFY | Add export buttons to aggregate summary and per-result sections |
| `src/App.tsx` | MODIFY | Pass `printings` to `ResultsView` |

## Edge Cases & Error Handling
- **Card with no printings**: Skip and show in error summary
- **Image download failure** (404, network error): Skip the image, continue, show summary of failures at the end
- **Large exports** (50+ images): Clear progress indicator, batched downloads
- **Card name sanitization**: Remove `/\:*?"<>|` and other filesystem-unfriendly chars, replace spaces with `_`, truncate overly long names
- **No missing cards**: Export buttons hidden/disabled when there are no missing cards
- **Empty card back**: Card back is optional; zip is valid without it
- **User cancels during export**: Abort pending fetches, clean up

## Technical Notes
- All image fetching happens client-side (no server needed)
- Images fetched as `Blob` via `fetch()` and added directly to JSZip
- The `large` image size from NRDB is suitable for printing (~300-400px wide, good for proxy printing)
- Typical card image: ~50-200KB at "large" size
- Browser memory can handle typical exports (up to a few hundred images)
- Each unique card image is fetched once and reused for duplicate copies in the zip
