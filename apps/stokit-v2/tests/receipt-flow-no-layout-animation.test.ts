import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// Device crash log (Stokit-2026-07-18, EXC_BAD_ACCESS / KERN_INVALID_ADDRESS
// 0x18 in RCTMountingManager via LayoutAnimationDelegateProxy) proved that a
// LayoutAnimation tick overlapping the receipt review Sheet (a Modal) mounting
// or unmounting crashes on the New Architecture. The shopping screen — which
// hosts the receipt flow and its Modal Sheets — must not use LayoutAnimation.
const src = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

test('shopping screen does not call LayoutAnimation.configureNext (Fabric + Modal crash)', () => {
  assert.doesNotMatch(src, /LayoutAnimation\.configureNext/);
});

test('shopping screen does not import LayoutAnimation', () => {
  // Comments may mention it; an actual `import`/usage token on its own line must not exist.
  assert.doesNotMatch(src, /^\s*LayoutAnimation,\s*$/m);
});
