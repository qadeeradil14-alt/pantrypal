import type { ItemCategory } from './defaultItems';

export interface StoreSection {
  key: string;
  label: string;
  icon: string;
  order: number;
}

const SECTIONS: Record<string, StoreSection> = {
  produce: { key: 'produce', label: 'Produce', icon: 'leaf-outline', order: 10 },
  bakery: { key: 'bakery', label: 'Bakery', icon: 'cafe-outline', order: 20 },
  dairy: { key: 'dairy', label: 'Dairy', icon: 'water-outline', order: 30 },
  meat: { key: 'meat', label: 'Meat & Seafood', icon: 'fish-outline', order: 40 },
  pantry: { key: 'pantry', label: 'Pantry', icon: 'file-tray-stacked-outline', order: 50 },
  canned: { key: 'canned', label: 'Canned Goods', icon: 'cube-outline', order: 60 },
  breakfast: { key: 'breakfast', label: 'Breakfast', icon: 'sunny-outline', order: 70 },
  condiments: { key: 'condiments', label: 'Condiments', icon: 'flask-outline', order: 80 },
  frozen: { key: 'frozen', label: 'Frozen', icon: 'snow-outline', order: 90 },
  household: { key: 'household', label: 'Household', icon: 'home-outline', order: 100 },
  other: { key: 'other', label: 'Other', icon: 'basket-outline', order: 110 },
};

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function resolveStoreSection(name: string, category: ItemCategory, aisle?: string | null): StoreSection {
  const customAisle = aisle?.trim();
  if (customAisle) {
    return {
      key: `aisle:${customAisle.toLowerCase()}`,
      label: customAisle,
      icon: 'map-outline',
      order: 45,
    };
  }

  const text = name.toLowerCase();

  if (category === 'freezer' || hasAny(text, ['frozen', 'ice cream'])) return SECTIONS.frozen;
  if (hasAny(text, ['lettuce', 'spinach', 'broccoli', 'carrot', 'celery', 'pepper', 'tomato', 'cucumber', 'onion', 'garlic', 'potato', 'apple', 'banana', 'berries', 'orange', 'lemon', 'lime'])) return SECTIONS.produce;
  if (hasAny(text, ['bread', 'bagel', 'tortilla', 'bun', 'roll', 'muffin'])) return SECTIONS.bakery;
  if (hasAny(text, ['milk', 'egg', 'butter', 'cheese', 'yogurt', 'cream'])) return SECTIONS.dairy;
  if (hasAny(text, ['chicken', 'beef', 'pork', 'turkey', 'salmon', 'fish', 'shrimp', 'meat'])) return SECTIONS.meat;
  if (hasAny(text, ['canned', 'beans', 'tomatoes', 'chickpeas', 'lentils', 'soup'])) return SECTIONS.canned;
  if (hasAny(text, ['cereal', 'oats', 'coffee', 'tea', 'jam', 'honey'])) return SECTIONS.breakfast;
  if (hasAny(text, ['oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'mayo', 'soy sauce', 'hot sauce'])) return SECTIONS.condiments;
  if (hasAny(text, ['paper', 'soap', 'detergent', 'trash', 'foil', 'wrap', 'cleaner'])) return SECTIONS.household;
  if (category === 'pantry') return SECTIONS.pantry;
  if (category === 'fridge') return SECTIONS.dairy;

  return SECTIONS.other;
}
