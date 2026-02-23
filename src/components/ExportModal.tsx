import { useState, useRef, useCallback } from 'react';
import { X, Download, Upload, ImageIcon, AlertTriangle } from 'lucide-react';
import { exportCardsAsZip, downloadBlob, type ExportCard } from '../utils/exportCards';

interface Props {
  cards: ExportCard[];
  side: 'runner' | 'corp';
  cardToPrintingId: Map<string, string>;
  onClose: () => void;
}

type Phase = 'configure' | 'exporting' | 'done' | 'error';

export function ExportModal({ cards, side, cardToPrintingId, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('configure');
  const [cardBackBlob, setCardBackBlob] = useState<Blob | null>(null);
  const [cardBackPreview, setCardBackPreview] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [failedCards, setFailedCards] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [exportedCount, setExportedCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalCopies = cards.reduce((sum, c) => sum + c.shortfall, 0);
  const uniqueCards = cards.length;

  const handleCardBackUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCardBackBlob(file);
    const url = URL.createObjectURL(file);
    // Clean up previous preview URL
    if (cardBackPreview) URL.revokeObjectURL(cardBackPreview);
    setCardBackPreview(url);
  }, [cardBackPreview]);

  const removeCardBack = useCallback(() => {
    setCardBackBlob(null);
    if (cardBackPreview) URL.revokeObjectURL(cardBackPreview);
    setCardBackPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [cardBackPreview]);

  const handleExport = useCallback(async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPhase('exporting');
    setProgressMessage('Preparing export...');
    setProgressCurrent(0);
    setProgressTotal(totalCopies);

    try {
      const result = await exportCardsAsZip({
        cards,
        side,
        cardBackBlob,
        cardToPrintingId,
        onProgress: (message, current, total) => {
          setProgressMessage(message);
          setProgressCurrent(current);
          setProgressTotal(total);
        },
        abortSignal: controller.signal,
      });

      setFailedCards(result.failedCards);
      setExportedCount(result.totalImages);
      setPhase('done');

      // Auto-trigger download
      const filename = `netrunner_${side}_proxies.zip`;
      downloadBlob(result.blob, filename);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setPhase('configure');
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred');
      setPhase('error');
    }
  }, [cards, side, cardBackBlob, cardToPrintingId, totalCopies]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const progressPercent = progressTotal > 0
    ? Math.round((progressCurrent / progressTotal) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={phase !== 'exporting' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Export for Printing</h2>
          {phase !== 'exporting' && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Configure phase */}
          {phase === 'configure' && (
            <>
              {/* Summary */}
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <div className="text-sm text-gray-300">
                  <span className="text-cyan-400 font-medium">{uniqueCards}</span> unique card{uniqueCards !== 1 ? 's' : ''}
                  {' / '}
                  <span className="text-cyan-400 font-medium">{totalCopies}</span> total {totalCopies !== 1 ? 'copies' : 'copy'} to download
                </div>
                <div className="text-xs text-gray-500">
                  Side: <span className="capitalize text-gray-400">{side}</span> — high-resolution images from NetrunnerDB
                </div>
              </div>

              {/* Card back upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Card Back Image <span className="text-gray-500">(optional)</span>
                </label>

                {cardBackPreview ? (
                  <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                    <img
                      src={cardBackPreview}
                      alt="Card back preview"
                      className="w-12 h-16 object-cover rounded border border-white/10"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-300 truncate">Card back uploaded</div>
                      <div className="text-xs text-gray-500">Will be saved as card_back.jpg in zip</div>
                    </div>
                    <button
                      onClick={removeCardBack}
                      className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                      title="Remove card back"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-white/10 rounded-lg text-gray-400 hover:text-gray-300 hover:border-white/20 transition-colors"
                  >
                    <Upload size={18} />
                    <span className="text-sm">Upload card back image</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleCardBackUpload}
                />
              </div>

              {/* Zip structure preview */}
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-400 mb-2">Zip contents:</div>
                <div className="text-xs text-gray-500 font-mono space-y-0.5">
                  <div>netrunner_{side}_proxies.zip</div>
                  {cardBackBlob && <div className="ml-3">card_back.jpg</div>}
                  <div className="ml-3">{side}/</div>
                  <div className="ml-6">0001_{'{card_id}'}_{'{card_name}'}.png</div>
                  {totalCopies > 1 && (
                    <div className="ml-6 text-gray-600">... ({totalCopies} files)</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Exporting phase */}
          {phase === 'exporting' && (
            <div className="py-4 space-y-4">
              <div className="flex justify-center">
                <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-300">{progressMessage}</p>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-center text-xs text-gray-500">
                {progressPercent}%
              </div>
            </div>
          )}

          {/* Done phase */}
          {phase === 'done' && (
            <div className="py-4 space-y-3">
              <div className="flex justify-center">
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                  <ImageIcon size={24} className="text-green-400" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-green-400 font-medium">Export complete!</p>
                <p className="text-xs text-gray-400 mt-1">
                  {exportedCount} card image{exportedCount !== 1 ? 's' : ''} saved to zip
                </p>
              </div>

              {failedCards.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-sm text-yellow-400 mb-1">
                    <AlertTriangle size={14} />
                    {failedCards.length} card{failedCards.length !== 1 ? 's' : ''} failed to download
                  </div>
                  <div className="text-xs text-gray-400 max-h-24 overflow-y-auto space-y-0.5">
                    {failedCards.map((id) => (
                      <div key={id}>{id}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error phase */}
          {phase === 'error' && (
            <div className="py-4 space-y-3">
              <div className="flex justify-center">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle size={24} className="text-red-400" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-red-400 font-medium">Export failed</p>
                <p className="text-xs text-gray-400 mt-1">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          {phase === 'configure' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
              >
                <Download size={16} />
                Download Zip
              </button>
            </>
          )}

          {phase === 'exporting' && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-gray-400 hover:text-red-400 transition-colors"
            >
              Cancel
            </button>
          )}

          {(phase === 'done' || phase === 'error') && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
