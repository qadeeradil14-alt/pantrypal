import assert from 'node:assert/strict';
import test from 'node:test';

import { reEvaluateRecipes, type RawMealData } from '../core/services/recipes';
import type { PantryItem } from '../types';

function pantry(name: string): PantryItem {
  return {
    id: name,
    name,
    quantity: 1,
    unit: 'unit',
    storeId: null,
    status: 'stocked',
    storageLocation: 'pantry',
    expiryDate: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function meal(id: string, title: string, ingredients: string[], instructions = 'Prep ingredients. Cook until done. Serve hot.', youtubeUrl = ''): RawMealData {
  return {
    id,
    title,
    description: 'Dinner',
    imageUrl: '',
    instructions,
    youtubeUrl,
    ingredientNames: ingredients,
    ingredientMeasures: ingredients.map(() => '1'),
  };
}

test('Make it tonight returns up to three pantry-matched dishes', () => {
  const recipes = reEvaluateRecipes(
    [
      meal('1', 'Pasta', ['pasta']),
      meal('2', 'Rice Bowl', ['rice']),
      meal('3', 'Potato Dinner', ['potato']),
      meal('4', 'No Match', ['shrimp']),
    ],
    [pantry('pasta'), pantry('rice'), pantry('potato')],
  );

  assert.deepEqual(recipes.map((r) => r.title), ['Pasta', 'Rice Bowl', 'Potato Dinner']);
});

test('Make it tonight provides step instructions and safe YouTube links only', () => {
  const [safe, unsafe] = reEvaluateRecipes(
    [
      meal('1', 'Safe Video', ['pasta'], '', 'https://www.youtube.com/watch?v=abc123'),
      meal('2', 'Unsafe Video', ['rice'], 'Rinse rice. Cook rice. Rest rice.', 'https://example.com/watch?v=abc123'),
    ],
    [pantry('pasta'), pantry('rice')],
  );

  assert.match(safe.instructions ?? '', /Prep the ingredients for Safe Video\.\nCook everything until hot and tender\.\nTaste, season, and serve\./);
  assert.equal(safe.youtubeUrl, 'https://www.youtube.com/watch?v=abc123');
  assert.match(unsafe.instructions ?? '', /Rinse rice\.\nCook rice\.\nRest rice\./);
  assert.equal(unsafe.youtubeUrl, '');
});
