import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const slidesSource = readFileSync(new URL('../constants/onboarding.ts', import.meta.url), 'utf8');
const screenSource = readFileSync(new URL('../app/(auth)/onboarding.tsx', import.meta.url), 'utf8');
const kitSource = readFileSync(new URL('../components/onboarding/OnboardingKit.tsx', import.meta.url), 'utf8');

test('onboarding slides remain in pantry, household, receipts order', () => {
  const pantry = slidesSource.indexOf("key: 'pantry'");
  const household = slidesSource.indexOf("key: 'household'");
  const receipts = slidesSource.indexOf("key: 'receipts'");

  assert.ok(pantry >= 0 && pantry < household && household < receipts);
});

test('dark onboarding illustrations are distinct from light artwork', () => {
  for (const name of ['pantry', 'household', 'receipts']) {
    const light = readFileSync(new URL(`../assets/onboarding/onboarding-${name}.png`, import.meta.url));
    const dark = readFileSync(new URL(`../assets/onboarding/onboarding-${name}-dark.png`, import.meta.url));
    assert.equal(dark.equals(light), false);
  }
});

test('onboarding keeps completion and welcome routing behavior', () => {
  assert.match(screenSource, /await complete\(\)/);
  assert.match(screenSource, /router\.replace\('\/\(auth\)\/welcome'\)/);
  assert.match(screenSource, /onPress=\{skip\}/);
});

test('onboarding content and controls use a centered tablet-safe width', () => {
  assert.match(screenSource, /maxWidth: 560/);
  assert.match(kitSource, /maxWidth: 560/);
});
