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
//
// Both stores now delegate the actual merge-or-replace decision to a single
// shared helper, foldRemoteActiveSession (core/services/shoppingEntrySync.ts),
// so they can never diverge. See
// tests/shopping-collaborator-add-during-store-transition.test.ts for the
// full behavioral regression coverage of that helper — this file only checks
// that durable-store.ts still routes through it.

const src = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');

test('durable-store imports the shared session-fold helper from shoppingEntrySync', () => {
  assert.match(
    src,
    /import \{ shoppingEntryEventForItem, foldRemoteActiveSession \} from '\.\.\/core\/services\/shoppingEntrySync'/,
    'must reuse foldRemoteActiveSession rather than reimplementing entry merge',
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

test('gateRemoteActiveSession delegates the merge-or-replace decision to the shared fold helper', () => {
  assert.match(
    src,
    /return foldRemoteActiveSession\(previous, remoteSession\);/,
    'must not reimplement the status/tripId gate inline — delegate to the shared, tested helper',
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
