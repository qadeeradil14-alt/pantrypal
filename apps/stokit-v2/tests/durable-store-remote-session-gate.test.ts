import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// durable-store.ts's applyRemotePatch used to write patch.activeSession straight
// into state. Any caller that pushed a partial/malformed remote patch (or a
// stale patch racing a same-trip update) could silently clobber the active
// shopping session — same class of bug already fixed in session-store.ts's
// applyRemoteSession. This ports the same gating policy into durable-store.ts
// so the two stores can't diverge.

const src = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');

test('durable-store imports the same session-sync policy helpers as session-store', () => {
  assert.match(
    src,
    /import \{ shoppingEntryEventForItem, mergeShoppingEntries \} from '\.\.\/core\/services\/shoppingEntrySync'/,
    'must reuse mergeShoppingEntries rather than reimplementing entry merge',
  );
  assert.match(
    src,
    /import \{ remoteShoppingSessionAction \} from '\.\.\/core\/services\/shoppingSessionSyncPolicy'/,
    'must reuse the shared clear/apply policy',
  );
});

test('gateRemoteActiveSession rejects malformed remote clears', () => {
  assert.match(
    src,
    /function gateRemoteActiveSession\(/,
    'gating function must exist',
  );
  assert.match(
    src,
    /if \(!remoteSession \|\| remoteShoppingSessionAction\(remoteSession\) === 'clear'\) \{\s*\n\s*return null;\s*\n\s*\}/,
    'malformed/null remote session must resolve to a clean null, never pass through unvalidated',
  );
});

test('gateRemoteActiveSession merges same-trip shopping_store sessions instead of overwriting', () => {
  assert.match(
    src,
    /previous\?\.status === 'shopping_store' &&\s*\n\s*remoteSession\.status === 'shopping_store' &&\s*\n\s*previous\.tripId === remoteSession\.tripId/,
    'same-trip in-progress sessions must be merged, not replaced',
  );
  assert.match(
    src,
    /entries: mergeShoppingEntries\(previous\.entries, remoteSession\.entries, removedItemIds\)/,
    'entries must go through the shared merge helper so removedItemIds are respected',
  );
  assert.match(
    src,
    /storeQueue: \[\s*\n\s*\.\.\.previous\.storeQueue,\s*\n\s*\.\.\.remoteSession\.storeQueue\.filter\(\(storeId\) => !previous\.storeQueue\.includes\(storeId\)\),\s*\n\s*\],/,
    'storeQueue must be unioned, not clobbered by the remote patch',
  );
});

test('applyRemotePatch routes activeSession through the gate instead of writing patch.activeSession directly', () => {
  assert.doesNotMatch(
    src,
    /activeSession: 'activeSession' in patch \? patch\.activeSession \?\? null : s\.activeSession \?\? null/,
    'the old ungated assignment must be gone',
  );
  assert.match(
    src,
    /const gatedActiveSession = 'activeSession' in patch\s*\n\s*\? gateRemoteActiveSession\(get\(\)\.activeSession \?\? null, patch\.activeSession \?\? null\)\s*\n\s*: undefined;/,
    'gated value must be computed from current state before the set() call',
  );
  assert.match(
    src,
    /activeSession: 'activeSession' in patch \? gatedActiveSession \?\? null : s\.activeSession \?\? null,/,
    'set() must write the gated result, not the raw patch',
  );
});
