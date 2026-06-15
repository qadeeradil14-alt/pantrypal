import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStoreBrand } from '../core/services/storeBrands';

test('known chains use curated logos', () => {
  assert.ok(getStoreBrand('ALDI').logoUrl);
});

test('unknown stores use a safe letter fallback without guessing a domain', () => {
  const brand = getStoreBrand('Hewad Local Market');
  assert.equal(brand.abbr, 'HL');
  assert.equal(brand.logoUrl, undefined);
});
