import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  canAccessDiagnostics,
  initialUnlockTapState,
  parseAllowlist,
  registerUnlockTap,
  UNLOCK_TAP_COUNT,
  UNLOCK_TAP_WINDOW_MS,
} from '../core/services/diagnostics/access';
import {
  buildStoreRows,
  collectAddItemSheet,
  collectShopping,
  collectStores,
  orphanedStoreReferences,
  resolveStoreName,
} from '../core/services/diagnostics/collect';
import { formatDiagnosticsReport } from '../core/services/diagnostics/report';
import { shouldRenderInlineDiagnostics } from '../core/services/diagnostics/visibility';
import { NO_MATCHING_STORE } from '../core/services/diagnostics/types';
import type { PantryItem, Store } from '../types';

const store = (id: string, name: string): Store =>
  ({ id, name, createdAt: 1, updatedAt: 1 }) as Store;

const item = (id: string, name: string, storeId: string | null, status = 'low'): PantryItem =>
  ({ id, name, storeId, status, quantity: 1, unit: 'unit', createdAt: 1, updatedAt: 1 }) as PantryItem;

const baseAccess = {
  isDevBundle: false,
  flagEnabled: false,
  allowlist: [] as string[],
  signedInUserId: 'user_1',
  signedInEmail: 'dev@example.com',
  developerModeEnabled: true,
};

// ── Hidden by default / release authorization ────────────────────────────────

test('diagnostics are hidden by default: no config flag means no access', () => {
  assert.equal(canAccessDiagnostics(baseAccess), false);
});

test('the existing developer flag is required even when the config flag is on', () => {
  assert.equal(
    canAccessDiagnostics({ ...baseAccess, flagEnabled: true, developerModeEnabled: false }),
    false,
  );
});

test('release + flag + devMode + empty allowlist = denied', () => {
  assert.equal(
    canAccessDiagnostics({ ...baseAccess, flagEnabled: true, allowlist: [] }),
    false,
    'an empty allowlist must never mean "allow everyone the flag reaches"',
  );
});

test('release + flag + devMode + matching user ID = allowed', () => {
  const allowlist = parseAllowlist('user_1, user_2');
  assert.equal(
    canAccessDiagnostics({ ...baseAccess, flagEnabled: true, allowlist, signedInUserId: 'user_1' }),
    true,
  );
});

test('release + flag + devMode + nonmatching user ID = denied', () => {
  const allowlist = parseAllowlist('user_2, user_3');
  assert.equal(
    canAccessDiagnostics({
      ...baseAccess, flagEnabled: true, allowlist, signedInUserId: 'user_1', signedInEmail: null,
    }),
    false,
  );
});

test('an allowlisted user is authorized by email too, case-insensitively', () => {
  const allowlist = parseAllowlist(' Owner@Example.com , user_999 ');
  assert.equal(
    canAccessDiagnostics({
      ...baseAccess, flagEnabled: true, allowlist, signedInUserId: null, signedInEmail: 'owner@example.com',
    }),
    true,
  );
});

test('local __DEV__ behavior remains usable: a dev bundle needs only the developer flag', () => {
  assert.equal(
    canAccessDiagnostics({ ...baseAccess, isDevBundle: true, flagEnabled: false, allowlist: [] }),
    true,
    'a development bundle must not need the config flag or an allowlist',
  );
  assert.equal(
    canAccessDiagnostics({ ...baseAccess, isDevBundle: true, developerModeEnabled: false }),
    false,
    'a dev bundle still requires the developer flag to be on',
  );
});

// ── Unlock gesture ───────────────────────────────────────────────────────────

test('the unlock gesture requires five taps inside the window', () => {
  let state = initialUnlockTapState;
  let unlocked = false;
  let now = 1_000;

  for (let tap = 1; tap < UNLOCK_TAP_COUNT; tap += 1) {
    const next = registerUnlockTap(state, now);
    state = { count: next.count, lastTapAt: next.lastTapAt };
    unlocked = next.unlocked;
    assert.equal(unlocked, false, `tap ${tap} must not unlock`);
    now += 200;
  }

  const final = registerUnlockTap(state, now);
  assert.equal(final.unlocked, true, `tap ${UNLOCK_TAP_COUNT} must unlock`);
  assert.equal(final.count, 0, 'the counter resets after unlocking');
});

test('a slow tap restarts the gesture instead of unlocking', () => {
  let state = initialUnlockTapState;
  let now = 1_000;
  for (let tap = 0; tap < UNLOCK_TAP_COUNT - 1; tap += 1) {
    const next = registerUnlockTap(state, now);
    state = { count: next.count, lastTapAt: next.lastTapAt };
    now += 200;
  }
  const late = registerUnlockTap(state, now + UNLOCK_TAP_WINDOW_MS + 1);
  assert.equal(late.unlocked, false, 'a tap outside the window must not complete the gesture');
  assert.equal(late.count, 1, 'the gesture restarts from one');
});

// ── Stores: duplicates stay visible ──────────────────────────────────────────

test('duplicate store IDs remain visible and are flagged, never collapsed', () => {
  const stores = [
    store('store_a', 'Costco Wholesale'),
    store('store_b', 'Safeway'),
    store('store_a', 'Kabul Halal Market'),
  ];
  const rows = buildStoreRows(stores);

  assert.equal(rows.length, 3, 'every store must produce a row, duplicates included');
  assert.deepEqual(rows.map((r) => r.index), [0, 1, 2]);
  assert.equal(rows[0].duplicateId, true);
  assert.equal(rows[2].duplicateId, true);
  assert.equal(rows[1].duplicateId, false);

  const section = collectStores(stores, []);
  const flagged = section.rows.filter((r) => r.flags?.includes('DUPLICATE ID'));
  assert.equal(flagged.length, 2, 'both sides of a duplicate id must be flagged');
});

test('stores whose names normalize identically are flagged', () => {
  const rows = buildStoreRows([store('s1', "Sam's Club"), store('s2', 'sams   club')]);
  assert.equal(rows[0].duplicateNormalizedName, false, 'apostrophes are not normalized away');

  const same = buildStoreRows([store('s1', ' Safeway '), store('s2', 'safeway')]);
  assert.equal(same[0].duplicateNormalizedName, true);
  assert.equal(same[1].duplicateNormalizedName, true);
});

// ── Unresolved store references ──────────────────────────────────────────────

test('unresolved store IDs report NO MATCHING STORE', () => {
  const stores = [store('store_a', 'Costco Wholesale')];
  assert.equal(resolveStoreName('store_a', stores), 'Costco Wholesale');
  assert.equal(resolveStoreName('store_gone', stores), NO_MATCHING_STORE);
  assert.equal(resolveStoreName(null, stores), '(unassigned)');
});

test('orphaned store references are counted from in-memory state only', () => {
  const stores = [store('store_a', 'Costco Wholesale')];
  const items = [
    item('i1', 'Apple', 'store_a'),
    item('i2', 'Banana', 'store_gone'),
    item('i3', 'Lemon', 'store_gone'),
  ];
  assert.deepEqual(orphanedStoreReferences(items, stores), [{ storeId: 'store_gone', itemCount: 2 }]);

  const section = collectStores(stores, items);
  assert.ok(
    section.rows.some((r) => r.flags?.includes(NO_MATCHING_STORE)),
    'the stores section must surface orphaned references',
  );
});

test('shopping rows resolve each storeId and flag unresolved ones', () => {
  const stores = [store('store_a', 'Costco Wholesale')];
  const items = [item('i1', 'Apple', 'store_gone'), item('i2', 'Bread', 'store_a', 'stocked')];
  const section = collectShopping(null, items, stores);

  const apple = section.rows.find((r) => r.label.includes('Apple'));
  assert.ok(apple, 'low items appear in the shopping section');
  assert.match(apple!.value, /NO MATCHING STORE/);
  assert.ok(!section.rows.some((r) => r.label.includes('Bread')), 'stocked items are not shopping items');
});

// ── AddItemSheet snapshot (collector logic) ──────────────────────────────────

test('the AddItemSheet snapshot reflects the bulk store immediately after it changes', () => {
  const stores = [
    store('store_costco', 'Costco Wholesale'),
    store('store_kabul', 'Kabul Halal Market'),
  ];
  const selections = [
    { key: 'apple', name: 'Apple', storeId: 'store_kabul' },
    { key: 'banana', name: 'Banana', storeId: 'store_kabul' },
  ];

  const section = collectAddItemSheet('store_kabul', selections, stores);

  const bulk = section.rows.find((r) => r.label === 'bulkStoreId');
  assert.equal(bulk?.value, 'store_kabul');
  assert.equal(
    section.rows.find((r) => r.label === 'bulk store resolves to')?.value,
    'Kabul Halal Market',
  );

  const apple = section.rows.find((r) => r.label === 'selected Apple');
  assert.match(apple!.value, /storeId = store_kabul/);
  assert.match(apple!.value, /Kabul Halal Market/);
  assert.ok(!apple!.flags?.includes('DIFFERS FROM BULK'));
});

test('a selected item left behind by a bulk change is flagged, not hidden', () => {
  const stores = [
    store('store_costco', 'Costco Wholesale'),
    store('store_kabul', 'Kabul Halal Market'),
  ];
  const section = collectAddItemSheet(
    'store_kabul',
    [{ key: 'apple', name: 'Apple', storeId: 'store_costco' }],
    stores,
  );

  const apple = section.rows.find((r) => r.label === 'selected Apple');
  assert.ok(apple!.flags?.includes('DIFFERS FROM BULK'), 'a stale per-item store must be visible');
});

test('the AddItemSheet snapshot lists every store by index so duplicate ids stay visible', () => {
  const stores = [store('dup', 'Costco Wholesale'), store('dup', 'Kabul Halal Market')];
  const section = collectAddItemSheet(null, [], stores);

  assert.ok(section.rows.some((r) => r.label === 'store[0] Costco Wholesale'));
  assert.ok(section.rows.some((r) => r.label === 'store[1] Kabul Halal Market'));
});

// ── AddItemSheet inline-panel visibility (authorization AND deliberate open) ─

test('release flag alone does not render the panel: unauthorized + "opened" stays hidden', () => {
  assert.equal(shouldRenderInlineDiagnostics(false, true), false);
});

test('unauthorized users never render the panel regardless of local open state', () => {
  assert.equal(shouldRenderInlineDiagnostics(false, false), false);
  assert.equal(shouldRenderInlineDiagnostics(false, true), false);
});

test('authorized but unopened diagnostics remain hidden', () => {
  assert.equal(shouldRenderInlineDiagnostics(true, false), false);
});

test('authorized and deliberately opened diagnostics render', () => {
  assert.equal(shouldRenderInlineDiagnostics(true, true), true);
});

// ── Report ────────────────────────────────────────────────────────────────────

test('the exported report carries headings, a timestamp and the required values', () => {
  const stores = [store('store_a', 'Costco Wholesale'), store('store_a', 'Kabul Halal Market')];
  const items = [item('i1', 'Apple', 'store_gone')];
  const report = formatDiagnosticsReport(
    [collectStores(stores, items), collectShopping(null, items, stores)],
    Date.UTC(2026, 6, 24, 12, 0, 0),
  );

  assert.match(report, /^STOKIT DEVELOPER DIAGNOSTICS/);
  assert.match(report, /generated: 2026-07-24T12:00:00\.000Z/);
  assert.match(report, /## Stores/);
  assert.match(report, /## Shopping/);
  assert.match(report, /id = store_a/, 'store ids are required for the report to be useful');
  assert.match(report, /DUPLICATE ID/);
  assert.match(report, /NO MATCHING STORE/);
});

test('the report never contains credential-shaped values', () => {
  const report = formatDiagnosticsReport([collectStores([store('s1', 'Costco')], [])]);
  assert.doesNotMatch(report, /token|password|secret|apikey|bearer/i);
});

// ── Redaction resolved by removal, not by dead code ──────────────────────────

test('the unused redaction module was removed rather than left as untested dead code', () => {
  assert.equal(
    existsSync(join(process.cwd(), 'core/services/diagnostics/redact.ts')),
    false,
    'no v1 collector needs redaction — sensitive fields are excluded by construction instead',
  );
  const types = readFileSync(join(process.cwd(), 'core/services/diagnostics/types.ts'), 'utf8');
  assert.match(
    types,
    /SENSITIVE FIELDS — excluded by construction, not redaction/,
    'the exclusion-by-construction decision must be documented for the next collector author',
  );
});

// ── Wiring: About screen ─────────────────────────────────────────────────────

test('About mounts the console only after unlock and unmounts it on close', () => {
  const src = readFileSync(join(process.cwd(), 'app/settings/about.tsx'), 'utf8');

  assert.match(
    src,
    /\{diagnosticsOpen \? \(\s*\n\s*<DeveloperConsole visible onClose=\{\(\) => setDiagnosticsOpen\(false\)\} \/>\s*\n\s*\) : null\}/,
    'the console must be conditionally mounted, so closing it unmounts everything',
  );
  assert.match(
    src,
    /if \(!diagnosticsAuthorized\) return;/,
    'unauthorized taps must be inert before any counting happens',
  );
  assert.match(src, /developerModeEnabled: devMode,/, 'the existing developer flag must gate access');
  assert.match(src, /flagEnabled: hasDiagnosticsFlag\(\),/, 'an explicit config flag must gate access');
  assert.match(src, /const DEV_MODE_TAP_TARGET = 7;/, 'the existing 7-tap developer gesture must be preserved');
});

test('the Build row is exposed to assistive tech as interactive, without naming the hidden gesture', () => {
  const src = readFileSync(join(process.cwd(), 'app/settings/about.tsx'), 'utf8');
  // Isolate just what a screen reader announces (role + label), not the
  // surrounding JSX — the onPress handler's own name legitimately contains
  // "Diagnostics" as source code, which is irrelevant to what gets announced.
  const onPressIdx = src.indexOf('onPress={handleDiagnosticsTap}');
  const pressableStart = src.lastIndexOf('<Pressable', onPressIdx);
  const attrs = src.slice(pressableStart, src.indexOf('>', onPressIdx));
  const roleMatch = attrs.match(/accessibilityRole="([^"]+)"/);
  const labelMatch = attrs.match(/accessibilityLabel="([^"]+)"/);

  assert.equal(roleMatch?.[1], 'button', 'an interactive row must not claim accessibilityRole="text"');
  assert.equal(labelMatch?.[1], 'Build info');
  assert.doesNotMatch(
    `${roleMatch?.[1]} ${labelMatch?.[1]}`,
    /diagnostic|unlock|secret|developer/i,
    'the announced role/label must not reveal the hidden gesture',
  );
});

// ── Wiring: AddItemSheet ─────────────────────────────────────────────────────

test('AddItemSheet requires the same authorization decision as the main console, not a standalone check', () => {
  const src = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');

  assert.doesNotMatch(
    src,
    /const diagnosticsVisible = __DEV__ \|\| hasDiagnosticsFlag\(\);/,
    'the old standalone build-time check must be gone',
  );
  assert.match(
    src,
    /const diagnosticsAuthorized = useDiagnosticsAuthorization\(\);/,
    'authorization must come from the same hook backing the Developer Console',
  );
});

test('AddItemSheet requires a deliberate open in addition to authorization', () => {
  const src = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');

  assert.match(src, /const \[diagnosticsOpen, setDiagnosticsOpen\] = useState\(false\);/);
  assert.match(
    src,
    /const diagnosticsRenderable = shouldRenderInlineDiagnostics\(diagnosticsAuthorized, diagnosticsOpen\);/,
    'both conditions must be combined through the shared, tested visibility helper',
  );
  assert.match(
    src,
    /onLongPress=\{diagnosticsAuthorized \? \(\) => setDiagnosticsOpen\(\(open\) => !open\) : undefined\}/,
    'the reveal gesture must itself be inert for an unauthorized viewer',
  );
});

test('the AddItemSheet panel is conditionally rendered and resets when the sheet resets', () => {
  const src = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');

  assert.match(
    src,
    /\{diagnosticsRenderable \? \(\s*\n\s*<DiagnosticsPanel compact sections=\{\[diagnosticsSection\]\} \/>\s*\n\s*\) : null\}/,
    'the panel must be conditionally mounted so it fully unmounts when either condition goes false',
  );
  assert.match(src, /setDiagnosticsOpen\(false\);/, 'reset() must close diagnostics along with the rest of the sheet state');
});

test('the AddItemSheet diagnostics snapshot is memoized on selection/store changes, not on every keystroke', () => {
  const src = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');

  assert.match(
    src,
    /const diagnosticsSection = useMemo\(\s*\n\s*\(\) => collectAddItemSheet\(/,
    'the snapshot must be memoized rather than rebuilt every render',
  );
  assert.match(
    src,
    /\[bulkStoreId, selected, stores\],\s*\n\s*\);/,
    'the memo must depend on the state that actually feeds the snapshot, not on `query`/`category`',
  );
});

test('the local-state design is preserved: selected and bulkStoreId stay component-local', () => {
  const src = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');
  assert.match(src, /const \[selected, setSelected\] = useState<Record<string, SelectedItem>>\(\{\}\);/);
  assert.match(src, /const \[bulkStoreId, setBulkStoreId\] = useState<string \| null>\(defaultStoreId\);/);
  assert.doesNotMatch(src, /useDurableStore\(\(s\) => s\.selected\)/, '`selected` must never move into the durable store');
});

test('the temporary red debug styling is gone', () => {
  const src = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');
  assert.doesNotMatch(src, /styles\.debugPanel|styles\.debugLine|styles\.debugTitle/);
});

// ── Copy/Share label honesty ──────────────────────────────────────────────────

test('the export action is labeled Share, not Copy — it opens the OS share sheet, not the clipboard', () => {
  const src = readFileSync(join(process.cwd(), 'components/diagnostics/DeveloperConsole.tsx'), 'utf8');
  assert.match(src, /label="Share diagnostics"/);
  assert.doesNotMatch(src, /label="Copy diagnostics"/);
  assert.match(src, /handleShare/);
});

// ── Large sections are bounded on screen, not in the export ──────────────────

test('DiagnosticsPanel caps rendered rows per section with an explicit omitted-rows indicator', () => {
  const src = readFileSync(join(process.cwd(), 'components/diagnostics/DiagnosticsPanel.tsx'), 'utf8');
  assert.match(src, /const MAX_VISIBLE_ROWS_PER_SECTION = 40;/);
  assert.match(src, /section\.rows\.slice\(0, MAX_VISIBLE_ROWS_PER_SECTION\)\.map/);
  assert.match(src, /additional row\(s\) omitted/);
});

test('the console collapses non-essential sections by default', () => {
  const src = readFileSync(join(process.cwd(), 'components/diagnostics/DeveloperConsole.tsx'), 'utf8');
  assert.match(src, /initiallyExpanded=\{\['general'\]\}/);
});

// ── Read-only safety sweep ────────────────────────────────────────────────────

test('the diagnostics console performs no writes, network calls or sync triggers', () => {
  const files = [
    'components/diagnostics/DeveloperConsole.tsx',
    'components/diagnostics/DiagnosticsPanel.tsx',
    'core/services/diagnostics/collect.ts',
    'core/services/diagnostics/report.ts',
    'core/services/diagnostics/access.ts',
    'core/services/diagnostics/visibility.ts',
    'core/services/diagnostics/types.ts',
  ];

  for (const file of files) {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    assert.doesNotMatch(src, /AsyncStorage\.setItem|AsyncStorage\.removeItem/, `${file} must not write storage`);
    assert.doesNotMatch(src, /supabase\./, `${file} must not touch Supabase`);
    assert.doesNotMatch(src, /\bfetch\(/, `${file} must not make network requests`);
    assert.doesNotMatch(src, /pushLocalState|persist\(\)|startSyncEngine/, `${file} must not trigger sync`);
    assert.doesNotMatch(src, /useEffect\(/, `${file} must not register side-effectful effects`);
    // Mutations are always store method calls — match call syntax, so an
    // identifier that merely contains a verb (e.g. the 'addItemSheet'
    // section id) is not mistaken for one.
    assert.doesNotMatch(
      src,
      /\.(updateItem|addItem|updateStore|addStore|deleteStore|deleteItem|setItemStatus|assignItemsToStore|clearShoppingEntries|applyRemotePatch|setActiveSession|dispatch)\(/,
      `${file} must not mutate state`,
    );
    assert.doesNotMatch(src, /\bset\(\{/, `${file} must not write to a zustand store`);
  }
});

test('useDiagnosticsAuthorization performs exactly one read-only hydration effect and nothing else', () => {
  // This hook is exempt from the blanket useEffect ban above: it legitimately
  // needs to hydrate `developerModeEnabled` from the existing persisted
  // developer flag on mount (the same pattern app/settings/about.tsx already
  // uses). It gets its own, narrower sweep instead.
  const src = readFileSync(
    join(process.cwd(), 'core/services/diagnostics/useDiagnosticsAuthorization.ts'),
    'utf8',
  );
  assert.match(src, /AsyncStorage\.getItem\(DEV_MODE_KEY\)/, 'must read the existing developer flag, not invent a new one');
  assert.doesNotMatch(src, /AsyncStorage\.setItem|AsyncStorage\.removeItem/, 'must never write the developer flag');
  assert.doesNotMatch(src, /supabase\.|\bfetch\(|pushLocalState|persist\(\)|startSyncEngine/, 'must perform no network or sync calls');
  assert.equal(
    (src.match(/useEffect\(/g) ?? []).length,
    1,
    'exactly one effect — the read-only hydration on mount',
  );
});
