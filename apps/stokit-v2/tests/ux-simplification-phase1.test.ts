import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('Home shopping summary card uses the neutral "Items to Buy" label, not solid-red', () => {
  const source = read('app/(tabs)/index.tsx');
  const firstCard = source.indexOf('<SummaryCard');
  const secondCard = source.indexOf('<SummaryCard', firstCard + 1);
  const cardBlock = source.slice(firstCard, secondCard);

  assert.match(cardBlock, /label="Items to Buy"/);
  assert.match(cardBlock, /tone="surface"/);
  assert.doesNotMatch(cardBlock, /tone="primary"/);
  assert.doesNotMatch(cardBlock, /tone=\{shoppingCount > 0 \? 'primary' : 'surface'\}/);
});

test('Home pantry summary card keeps its neutral label and surface tone', () => {
  const source = read('app/(tabs)/index.tsx');
  const firstCard = source.indexOf('<SummaryCard');
  const secondCard = source.indexOf('<SummaryCard', firstCard + 1);
  const cardBlock = source.slice(secondCard, source.indexOf('</View>', secondCard));

  assert.match(cardBlock, /label="Pantry Items"/);
  assert.match(cardBlock, /tone="surface"/);
});
