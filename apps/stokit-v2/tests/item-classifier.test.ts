import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyItem } from '../core/services/itemClassifier';

const cases: Array<[input: string, emoji: string]> = [
  // collision regressions (substring matching used to misfire on all of these)
  ['towel', '🧺'],
  ['towels', '🧺'],
  ['bath towels', '🧺'],
  ['paper towels', '🧻'],
  ['toilet paper', '🧻'],
  ['pineapple', '🍍'],
  ['butter lettuce', '🥬'],
  ['butternut squash', '🎃'],
  ['ice cream', '🍦'],
  ['apple pie', '🥧'],
  ['cream cheese', '🧀'],
  ['peanut butter', '🥜'],

  // legumes — dry variants must not fall through to 📦
  ['lentils', '🫘'],
  ['red lentils', '🫘'],
  ['green lentils', '🫘'],
  ['french lentils', '🫘'],
  ['chickpeas', '🫘'],
  ['garbanzo beans', '🫘'],

  // plant proteins
  ['tofu', '🍱'],
  ['tempeh', '🍱'],

  // mixed greens
  ['mixed greens', '🥗'],
  ['spring mix', '🥗'],

  // dried fruit
  ['raisins', '🍇'],
  ['dried cranberries', '🍇'],

  // yogurt must not show sake jug
  ['yogurt', '🥛'],
  ['greek yogurt', '🥛'],

  // plain matches must keep working
  ['apple', '🍎'],
  ['apples', '🍎'],
  ['butter', '🧈'],
  ['cream', '🥛'],
  ['heavy cream', '🥛'],
  ['lettuce', '🥬'],
  ['pie', '🥧'],
  ['tissue', '🧻'],
  ['napkins', '🧻'],
  ['orange juice', '🧃'],
];

for (const [input, emoji] of cases) {
  test(`classifyItem("${input}") → ${emoji}`, () => {
    assert.equal(classifyItem(input).emoji, emoji);
  });
}

test('empty and unknown inputs fall back to default', () => {
  assert.equal(classifyItem('').emoji, '📦');
  assert.equal(classifyItem('   ').emoji, '📦');
  assert.equal(classifyItem('zzzz unknown thing').emoji, '📦');
});
