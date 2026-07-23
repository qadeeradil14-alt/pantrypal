/** Lightweight unique id generator (no native crypto dependency). */
let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export const now = () => Date.now();

/**
 * Monotonic timestamp: never <= the field's currently known value. Wall-clock
 * LWW merges (mergePantryItems, mergeShoppingEntries's last-tap-wins) compare
 * this value across devices; a plain Date.now() can regress below a value the
 * field already holds (e.g. after applying a faster-clock peer's edit), which
 * makes the slower-clock device's own subsequent edits lose the merge forever
 * (OTA 389 directional-sync investigation). `base` defaults to the wall clock
 * but callers with their own timestamp (e.g. a dispatched event's `now`) may
 * pass it explicitly so the anchor stays consistent with that action.
 */
export function nextTimestamp(current: number | null | undefined, base: number = now()): number {
  return Math.max(base, (current ?? 0) + 1);
}
