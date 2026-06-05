import { create } from 'zustand';

/**
 * Lightweight cross-screen "data changed" signal.
 *
 * Receipts/spend have no global Zustand cache (each screen fetches on focus),
 * so a receipt written on this device — or pushed via realtime from a partner —
 * never reaches an already-mounted, already-focused screen. That's the
 * "needs app restart" staleness: Activity / Receipts / weekly-spend only
 * refreshed when you re-entered the tab.
 *
 * `receiptsVersion` is bumped whenever the receipts table changes. Screens that
 * derive from receipts watch it and refetch, in addition to their focus refetch.
 */
interface DataSignalState {
  receiptsVersion: number;
  bumpReceipts: () => void;
}

export const useDataSignal = create<DataSignalState>((set) => ({
  receiptsVersion: 0,
  bumpReceipts: () => set((s) => ({ receiptsVersion: s.receiptsVersion + 1 })),
}));
