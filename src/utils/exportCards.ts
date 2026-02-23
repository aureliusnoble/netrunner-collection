import JSZip from 'jszip';
import { getCardImageUrl, getCardImageUrlHiRes } from './cardPrintings';

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

// MPC bleed: 1/8" per side at 300 DPI = 36px per side
// 750x1050 card + 36px bleed on each side = 822x1122 final
const BLEED_PX = 36;

/**
 * Add MPC-compatible bleed by replicating edge pixels outward (like ProxyNexus),
 * then convert to PNG. For images that aren't 750x1050 (fallback low-res), the
 * bleed is scaled proportionally.
 */
async function addBleedAndConvertToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  // Scale bleed proportionally if the image isn't 750px wide (e.g. 300px fallback)
  const bleed = Math.round(BLEED_PX * (srcW / 750));
  const dstW = srcW + bleed * 2;
  const dstH = srcH + bleed * 2;

  const canvas = new OffscreenCanvas(dstW, dstH);
  const ctx = canvas.getContext('2d')!;

  // Draw the original image centered
  ctx.drawImage(bitmap, bleed, bleed);

  // Replicate edges outward (BORDER_REPLICATE style):
  // Top edge — stretch the top 1px row into the top bleed area
  ctx.drawImage(bitmap, 0, 0, srcW, 1, bleed, 0, srcW, bleed);
  // Bottom edge — stretch the bottom 1px row into the bottom bleed area
  ctx.drawImage(bitmap, 0, srcH - 1, srcW, 1, bleed, bleed + srcH, srcW, bleed);
  // Left edge — stretch the left 1px column into the left bleed area
  ctx.drawImage(bitmap, 0, 0, 1, srcH, 0, bleed, bleed, srcH);
  // Right edge — stretch the right 1px column into the right bleed area
  ctx.drawImage(bitmap, srcW - 1, 0, 1, srcH, bleed + srcW, bleed, bleed, srcH);

  // Corners — fill with the corner pixel color
  // Top-left
  ctx.drawImage(bitmap, 0, 0, 1, 1, 0, 0, bleed, bleed);
  // Top-right
  ctx.drawImage(bitmap, srcW - 1, 0, 1, 1, bleed + srcW, 0, bleed, bleed);
  // Bottom-left
  ctx.drawImage(bitmap, 0, srcH - 1, 1, 1, 0, bleed + srcH, bleed, bleed);
  // Bottom-right
  ctx.drawImage(bitmap, srcW - 1, srcH - 1, 1, 1, bleed + srcW, bleed + srcH, bleed, bleed);

  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
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
        const hiResUrl = getCardImageUrlHiRes(printingId);
        const fallbackUrl = getCardImageUrl(printingId);
        let blob: Blob;
        try {
          blob = await fetchImageBlob(hiResUrl, abortSignal);
        } catch {
          blob = await fetchImageBlob(fallbackUrl, abortSignal);
        }
        const pngBlob = await addBleedAndConvertToPng(blob);
        images.set(cardId, pngBlob);
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
      const filename = `${padNumber(fileNumber)}_${card.cardId}_${safeName}.png`;
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
