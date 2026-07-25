/**
 * Developer Diagnostics — shared types.
 *
 * READ-ONLY OBSERVER. Nothing in core/services/diagnostics may mutate state,
 * write storage, hit the network, or trigger sync. Collectors are pure
 * functions from already-in-memory values to display rows.
 *
 * ARCHITECTURE NOTE — async sections (future): Supabase reachability, storage
 * usage, sync timeline and similar sections need data that isn't already in
 * memory. When one of those is added, DO NOT fetch inside a collector or a
 * component's render/useEffect. Instead give it an explicit snapshot/loader
 * contract — e.g. a `loadXSnapshot(): Promise<XSnapshot>` called once from a
 * deliberate user action (opening that section, a "Refresh" tap), with the
 * result cached in that section's own local state and passed into a pure
 * collector the same way `stores`/`items`/`session` are passed in today. The
 * synchronous `DiagnosticSection[]` contract in this file stays exactly as
 * it is; only the surface that produces the input to a collector gains an
 * explicit, user-triggered async step ahead of it.
 *
 * SENSITIVE FIELDS — excluded by construction, not redaction: no v1
 * collector (general/stores/shopping/addItemSheet) reads or accepts an
 * access token, refresh token, password, API key, full push token, or raw
 * session object — those values are simply never passed in, so there is
 * nothing to redact. Store ids and pantry item ids ARE shown deliberately;
 * they carry no personal information and are exactly what a store-
 * assignment report exists to compare. If a future section (e.g. Auth)
 * needs to display a user id or email, write a small redaction helper next
 * to that collector, guarded by a test asserting the raw value never
 * appears in `formatDiagnosticsReport`'s output — do not display it raw and
 * do not add a general-purpose redaction utility ahead of a concrete need.
 */

/** Shown wherever a storeId does not resolve against the current store list. */
export const NO_MATCHING_STORE = 'NO MATCHING STORE';

/**
 * Sections the framework can host. Only 'general', 'stores', 'shopping' and
 * 'addItemSheet' have collectors in v1; the rest are declared so later
 * sections slot in without touching the framework or the console shell.
 */
export type DiagnosticSectionId =
  | 'general'
  | 'auth'
  | 'household'
  | 'stores'
  | 'pantry'
  | 'shopping'
  | 'sync'
  | 'notifications'
  | 'geofencing'
  | 'persistence'
  | 'addItemSheet';

/** A single label/value line. `flags` renders as small warning chips. */
export interface DiagnosticRow {
  label: string;
  value: string;
  flags?: string[];
}

export interface DiagnosticSection {
  id: DiagnosticSectionId;
  title: string;
  /** Shown next to the title, e.g. a count. */
  subtitle?: string;
  rows: DiagnosticRow[];
}
