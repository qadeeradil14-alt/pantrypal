/**
 * Developer Diagnostics — section collectors.
 *
 * Every function here is pure: in-memory values in, display rows out. No
 * store access, no I/O, no side effects — the console passes state in.
 */

import type { PantryItem, Store } from '../../../types';
import { normalizeStoreText } from '../storeDuplicates';
import { NO_MATCHING_STORE, type DiagnosticRow, type DiagnosticSection } from './types';

/** Resolves a storeId for display, flagging ids absent from the store list. */
export function resolveStoreName(storeId: string | null | undefined, stores: Store[]): string {
  if (!storeId) return '(unassigned)';
  return stores.find((store) => store.id === storeId)?.name ?? NO_MATCHING_STORE;
}

// ── General ──────────────────────────────────────────────────────────────────

export interface GeneralDiagnosticsInput {
  appVersion?: string | null;
  buildNumber?: string | null;
  otaSequence?: number | null;
  runtimeVersion?: string | null;
  channel?: string | null;
  route?: string | null;
  bundle: 'development' | 'release';
}

export function collectGeneral(input: GeneralDiagnosticsInput): DiagnosticSection {
  return {
    id: 'general',
    title: 'General',
    rows: [
      { label: 'app version', value: input.appVersion || '(unknown)' },
      { label: 'build number', value: input.buildNumber || '(unknown)' },
      { label: 'OTA sequence', value: input.otaSequence == null ? '(unknown)' : String(input.otaSequence) },
      { label: 'runtime version', value: input.runtimeVersion || '(unknown)' },
      { label: 'channel', value: input.channel || '(unknown)' },
      { label: 'bundle', value: input.bundle },
      { label: 'route', value: input.route || '(unknown)' },
    ],
  };
}

// ── Stores ───────────────────────────────────────────────────────────────────

export interface StoreDiagnosticRow {
  index: number;
  name: string;
  id: string;
  duplicateId: boolean;
  duplicateNormalizedName: boolean;
}

/**
 * One row per store, in array order, flagging ids that appear more than once
 * and names that normalize to the same value. Never de-duplicates: a
 * duplicate is exactly what the reader is looking for.
 */
export function buildStoreRows(stores: Store[]): StoreDiagnosticRow[] {
  const idCounts = new Map<string, number>();
  const nameCounts = new Map<string, number>();
  for (const store of stores) {
    idCounts.set(store.id, (idCounts.get(store.id) ?? 0) + 1);
    const normalized = normalizeStoreText(store.name);
    nameCounts.set(normalized, (nameCounts.get(normalized) ?? 0) + 1);
  }

  return stores.map((store, index) => ({
    index,
    name: store.name,
    id: store.id,
    duplicateId: (idCounts.get(store.id) ?? 0) > 1,
    duplicateNormalizedName: (nameCounts.get(normalizeStoreText(store.name)) ?? 0) > 1,
  }));
}

/** storeIds referenced by items that no longer exist in the store list. */
export function orphanedStoreReferences(
  items: PantryItem[],
  stores: Store[],
): { storeId: string; itemCount: number }[] {
  const known = new Set(stores.map((store) => store.id));
  const orphans = new Map<string, number>();
  for (const item of items) {
    if (!item.storeId || known.has(item.storeId)) continue;
    orphans.set(item.storeId, (orphans.get(item.storeId) ?? 0) + 1);
  }
  return [...orphans.entries()].map(([storeId, itemCount]) => ({ storeId, itemCount }));
}

export function collectStores(stores: Store[], items: PantryItem[]): DiagnosticSection {
  const rows: DiagnosticRow[] = buildStoreRows(stores).map((row) => {
    const flags: string[] = [];
    if (row.duplicateId) flags.push('DUPLICATE ID');
    if (row.duplicateNormalizedName) flags.push('DUPLICATE NAME');
    return {
      label: `[${row.index}] ${row.name}`,
      value: `id = ${row.id}`,
      flags: flags.length ? flags : undefined,
    };
  });

  const orphans = orphanedStoreReferences(items, stores);
  for (const orphan of orphans) {
    rows.push({
      label: `orphaned reference ${orphan.storeId}`,
      value: `${orphan.itemCount} item(s) point at a store that no longer exists`,
      flags: [NO_MATCHING_STORE],
    });
  }

  return {
    id: 'stores',
    title: 'Stores',
    subtitle: `${stores.length} total${orphans.length ? `, ${orphans.length} orphaned ref(s)` : ''}`,
    rows: rows.length ? rows : [{ label: '(no stores)', value: '' }],
  };
}

// ── Shopping ─────────────────────────────────────────────────────────────────

/** Structural shape shared by ShoppingSession and SharedShoppingSession. */
export interface SessionLike {
  status?: string;
  tripId?: string | null;
  startedAt?: number | null;
  storeQueue?: string[];
  currentIndex?: number;
  skippedStoreIds?: string[];
  entries?: { itemId: string; name: string; storeId: string; picked?: boolean; outOfStock?: boolean }[];
}

export function collectShopping(
  session: SessionLike | null,
  items: PantryItem[],
  stores: Store[],
): DiagnosticSection {
  const rows: DiagnosticRow[] = [];

  rows.push({ label: 'session status', value: session?.status ?? 'idle (no active session)' });
  if (session?.tripId) rows.push({ label: 'tripId', value: session.tripId });
  if (session?.startedAt) {
    rows.push({ label: 'startedAt', value: new Date(session.startedAt).toISOString() });
  }

  const queue = session?.storeQueue ?? [];
  if (queue.length) {
    rows.push({ label: 'currentIndex', value: String(session?.currentIndex ?? 0) });
    queue.forEach((storeId, index) => {
      const resolved = resolveStoreName(storeId, stores);
      const flags: string[] = [];
      if (resolved === NO_MATCHING_STORE) flags.push(NO_MATCHING_STORE);
      if (session?.skippedStoreIds?.includes(storeId)) flags.push('SKIPPED');
      if (index === (session?.currentIndex ?? -1)) flags.push('CURRENT');
      rows.push({
        label: `queue[${index}] ${resolved}`,
        value: `storeId = ${storeId}`,
        flags: flags.length ? flags : undefined,
      });
    });
  }

  const entries = session?.entries ?? [];
  entries.forEach((entry, index) => {
    const resolved = resolveStoreName(entry.storeId, stores);
    const flags: string[] = [];
    if (resolved === NO_MATCHING_STORE) flags.push(NO_MATCHING_STORE);
    if (entry.picked) flags.push('picked');
    if (entry.outOfStock) flags.push('outOfStock');
    rows.push({
      label: `entry[${index}] ${entry.name}`,
      value: `itemId = ${entry.itemId} | storeId = ${entry.storeId} | ${resolved}`,
      flags: flags.length ? flags : undefined,
    });
  });

  // The shopping list as the Shopping tab derives it: low/expiring items.
  const shoppingItems = items.filter((item) => item.status === 'low' || item.status === 'expiring');
  shoppingItems.forEach((item) => {
    const resolved = resolveStoreName(item.storeId, stores);
    rows.push({
      label: `item ${item.name}`,
      value: `itemId = ${item.id} | storeId = ${String(item.storeId)} | ${resolved}`,
      flags: resolved === NO_MATCHING_STORE ? [NO_MATCHING_STORE] : undefined,
    });
  });

  return {
    id: 'shopping',
    title: 'Shopping',
    subtitle: `${shoppingItems.length} shopping item(s), ${entries.length} session entr(ies)`,
    rows,
  };
}

// ── AddItemSheet local snapshot ──────────────────────────────────────────────

/**
 * AddItemSheet keeps `selected` and `bulkStoreId` in component-local state by
 * design; diagnostics observes them by receiving this read-only snapshot
 * rather than by moving them into a store.
 */
export interface AddItemSheetSelection {
  key: string;
  name: string;
  storeId: string | null;
}

export function collectAddItemSheet(
  bulkStoreId: string | null,
  selections: AddItemSheetSelection[],
  stores: Store[],
): DiagnosticSection {
  const rows: DiagnosticRow[] = [];
  const bulkResolved = resolveStoreName(bulkStoreId, stores);

  rows.push({
    label: 'bulkStoreId',
    value: String(bulkStoreId),
    flags: bulkResolved === NO_MATCHING_STORE ? [NO_MATCHING_STORE] : undefined,
  });
  rows.push({ label: 'bulk store resolves to', value: bulkResolved });

  if (!selections.length) {
    rows.push({ label: '(no items selected)', value: '' });
  }
  selections.forEach((selection) => {
    const resolved = resolveStoreName(selection.storeId, stores);
    const flags: string[] = [];
    if (resolved === NO_MATCHING_STORE) flags.push(NO_MATCHING_STORE);
    if (bulkStoreId != null && selection.storeId !== bulkStoreId) flags.push('DIFFERS FROM BULK');
    rows.push({
      label: `selected ${selection.name}`,
      value: `key = ${selection.key} | storeId = ${String(selection.storeId)} | ${resolved}`,
      flags: flags.length ? flags : undefined,
    });
  });

  // Indexed labels, never keyed by id alone, so a duplicate id stays visible.
  stores.forEach((store, index) => {
    rows.push({ label: `store[${index}] ${store.name}`, value: `id = ${store.id}` });
  });

  return {
    id: 'addItemSheet',
    title: 'Add Items — local state',
    subtitle: `${selections.length} selected, ${stores.length} store(s)`,
    rows,
  };
}
