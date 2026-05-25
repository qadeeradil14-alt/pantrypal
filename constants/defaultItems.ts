export type ItemCategory = 'fridge' | 'pantry' | 'freezer';

export interface DefaultItem {
  name: string;
  category: ItemCategory;
}

export const DEFAULT_ITEMS: DefaultItem[] = [
  // Fridge
  { name: 'Milk', category: 'fridge' },
  { name: 'Eggs', category: 'fridge' },
  { name: 'Butter', category: 'fridge' },
  { name: 'Cheese', category: 'fridge' },
  { name: 'Yogurt', category: 'fridge' },
  { name: 'Chicken breast', category: 'fridge' },
  { name: 'Ground beef', category: 'fridge' },
  { name: 'Salmon', category: 'fridge' },
  { name: 'Lettuce', category: 'fridge' },
  { name: 'Spinach', category: 'fridge' },
  { name: 'Broccoli', category: 'fridge' },
  { name: 'Carrots', category: 'fridge' },
  { name: 'Celery', category: 'fridge' },
  { name: 'Bell peppers', category: 'fridge' },
  { name: 'Tomatoes', category: 'fridge' },
  { name: 'Cucumber', category: 'fridge' },
  { name: 'Orange juice', category: 'fridge' },
  { name: 'Cream', category: 'fridge' },
  { name: 'Sour cream', category: 'fridge' },
  // Pantry
  { name: 'Rice', category: 'pantry' },
  { name: 'Pasta', category: 'pantry' },
  { name: 'Bread', category: 'pantry' },
  { name: 'Flour', category: 'pantry' },
  { name: 'Sugar', category: 'pantry' },
  { name: 'Salt', category: 'pantry' },
  { name: 'Pepper', category: 'pantry' },
  { name: 'Olive oil', category: 'pantry' },
  { name: 'Vegetable oil', category: 'pantry' },
  { name: 'Canned tomatoes', category: 'pantry' },
  { name: 'Black beans', category: 'pantry' },
  { name: 'Chickpeas', category: 'pantry' },
  { name: 'Lentils', category: 'pantry' },
  { name: 'Oats', category: 'pantry' },
  { name: 'Cereal', category: 'pantry' },
  { name: 'Coffee', category: 'pantry' },
  { name: 'Tea', category: 'pantry' },
  { name: 'Honey', category: 'pantry' },
  { name: 'Vinegar', category: 'pantry' },
  { name: 'Soy sauce', category: 'pantry' },
  { name: 'Hot sauce', category: 'pantry' },
  { name: 'Onions', category: 'pantry' },
  { name: 'Garlic', category: 'pantry' },
  { name: 'Potatoes', category: 'pantry' },
  { name: 'Crackers', category: 'pantry' },
  { name: 'Peanut butter', category: 'pantry' },
  { name: 'Jam', category: 'pantry' },
  // Freezer
  { name: 'Frozen peas', category: 'freezer' },
  { name: 'Frozen corn', category: 'freezer' },
  { name: 'Ice cream', category: 'freezer' },
  { name: 'Frozen fish', category: 'freezer' },
  { name: 'Frozen chicken', category: 'freezer' },
];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  fridge: 'Fridge',
  pantry: 'Pantry',
  freezer: 'Freezer',
};

export const CATEGORY_ICONS: Record<ItemCategory, string> = {
  fridge: '❄️',
  pantry: '🧺',
  freezer: '🧊',
};
