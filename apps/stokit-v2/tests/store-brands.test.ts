import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStoreBrand } from '../core/services/storeBrands';

test('known chains use curated logos', () => {
  assert.ok(getStoreBrand('ALDI').logoUrl);
});

test('home and household chains use verified logos across common place names', () => {
  assert.match(getStoreBrand('The Home Depot').logoUrl ?? '', /homedepot\.com/);
  assert.match(getStoreBrand("Lowe's Home Improvement").logoUrl ?? '', /lowes\.com/);
  assert.match(getStoreBrand('PetSmart - Potomac Mills').logoUrl ?? '', /petsmart\.com/);
  assert.match(getStoreBrand('O’Reilly Auto Parts').logoUrl ?? '', /oreillyauto\.com/);
});

test('longest verified chain wins when names overlap', () => {
  assert.match(getStoreBrand('Giant Eagle').logoUrl ?? '', /gianteagle\.com/);
  assert.match(getStoreBrand('Nordstrom Rack').logoUrl ?? '', /nordstromrack\.com/);
});

test('unknown stores use a safe letter fallback without guessing a domain', () => {
  const brand = getStoreBrand('Hewad Local Market');
  assert.equal(brand.abbr, 'HL');
  assert.equal(brand.logoUrl, undefined);
});
