import JSZip from 'jszip';
import { getCardImageUrl } from './cardPrintings';

export interface ExportCard {
  cardId: string;
  cardTitle: string;
  shortfall: number;
}

export interface ExportOptions {
  cards: ExportCard[];
  side: 'runner' | 'corp';
  cardBackBlob: Blob | null;
  cardToPrintingId: Map<string, string>;
  onProgress: (message: string, current: number, total: number) => void;
  abortSignal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  totalImages: number;
  failedCards: string[];
}

/** Sanitize a card name for use in a filename. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

/** Zero-pad a number to 4 digits. */
function padNumber(n: number): string {
  return String(n).padStart(4, '0');
}

/** Fetch an image as a Blob with retry support. */
async function fetchImageBlob(
  url: string,
  signal?: AbortSignal,
  retries = 2
): Promise<Blob> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.blob();
    } catch (err) {
      if (signal?.aborted) throw err;
      if (attempt === retries) throw err;
      // Wait before retry (exponential backoff)
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

/**
 * Download card images in batches to avoid overwhelming the server.
 * Returns a map of cardId → image Blob (one fetch per unique card).
 */
async function fetchCardImages(
  cards: ExportCard[],
  cardToPrintingId: Map<string, string>,
  onProgress: (message: string, current: number, total: number) => void,
  abortSignal?: AbortSignal,
): Promise<{ images: Map<string, Blob>; failed: string[] }> {
  const uniqueCardIds = [...new Set(cards.map((c) => c.cardId))];
  const images = new Map<string, Blob>();
  const failed: string[] = [];
  const BATCH_SIZE = 5;

  let completed = 0;
  const total = uniqueCardIds.length;

  for (let i = 0; i < uniqueCardIds.length; i += BATCH_SIZE) {
    if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const batch = uniqueCardIds.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (cardId) => {
      const printingId = cardToPrintingId.get(cardId);
      if (!printingId) {
        failed.push(cardId);
        return;
      }

      try {
        const url = getCardImageUrl(printingId);
        const blob = await fetchImageBlob(url, abortSignal);
        images.set(cardId, blob);
      } catch {
        if (abortSignal?.aborted) return;
        failed.push(cardId);
      }
    });

    await Promise.all(promises);
    completed += batch.length;
    onProgress(
      `Downloading card images... (${Math.min(completed, total)}/${total})`,
      Math.min(completed, total),
      total,
    );
  }

  return { images, failed };
}

/** Export missing cards as a zip file. */
export async function exportCardsAsZip(options: ExportOptions): Promise<ExportResult> {
  const { cards, side, cardBackBlob, cardToPrintingId, onProgress, abortSignal } = options;

  const totalImages = cards.reduce((sum, c) => sum + c.shortfall, 0);
  onProgress('Preparing export...', 0, totalImages);

  // Fetch all unique card images
  const { images, failed } = await fetchCardImages(
    cards,
    cardToPrintingId,
    onProgress,
    abortSignal,
  );

  if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

  onProgress('Building zip file...', totalImages, totalImages);

  const zip = new JSZip();
  const folder = zip.folder(side)!;

  // Add card back if provided
  if (cardBackBlob) {
    zip.file('card_back.jpg', cardBackBlob);
  }

  // Add card images — one file per copy needed
  let fileNumber = 1;
  for (const card of cards) {
    const imageBlob = images.get(card.cardId);
    if (!imageBlob) continue;

    const safeName = sanitizeFilename(card.cardTitle);
    for (let copy = 0; copy < card.shortfall; copy++) {
      const filename = `${padNumber(fileNumber)}_${card.cardId}_${safeName}.jpg`;
      folder.file(filename, imageBlob);
      fileNumber++;
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });

  return {
    blob: zipBlob,
    totalImages: fileNumber - 1,
    failedCards: failed,
  };
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
