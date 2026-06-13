import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG_SEARCH_LIMIT,
  getExtendedCatalogSize,
  hasExactCatalogMatch,
  searchPantryCatalog,
} from '../constants/catalogSearch';

test('extended catalog contains more than 10,000 lightweight item variants', () => {
  assert.ok(getExtendedCatalogSize() > 10000);
});

test('search results are ranked and capped', () => {
  const results = searchPantryCatalog('milk');
  assert.ok(results.length > 0);
  assert.ok(results.length <= CATALOG_SEARCH_LIMIT);
  assert.equal(results[0].name, 'Milk');
});

test('aliases and regional household terms are searchable', () => {
  assert.ok(searchPantryCatalog('non dairy').some((item) => item.category === 'Dairy'));
  assert.ok(searchPantryCatalog('doogh').some((item) => item.name === 'Doogh'));
});

test('generated catalog items count as exact matches', () => {
  assert.equal(hasExactCatalogMatch('Organic Apple Bag'), true);
});
