import type { ItemCategory } from './defaultItems';

export enum InventoryItemType {
  Milk = 'milk',
  Eggs = 'eggs',
  Butter = 'butter',
  Cheese = 'cheese',
  Yogurt = 'yogurt',
  ChickenBreast = 'chicken_breast',
  GroundBeef = 'ground_beef',
  Salmon = 'salmon',
  Lettuce = 'lettuce',
  Spinach = 'spinach',
  Broccoli = 'broccoli',
  Carrots = 'carrots',
  Celery = 'celery',
  BellPeppers = 'bell_peppers',
  Tomatoes = 'tomatoes',
  Cucumber = 'cucumber',
  OrangeJuice = 'orange_juice',
  Cream = 'cream',
  SourCream = 'sour_cream',
  Rice = 'rice',
  Pasta = 'pasta',
  Bread = 'bread',
  Flour = 'flour',
  Sugar = 'sugar',
  Salt = 'salt',
  Pepper = 'pepper',
  OliveOil = 'olive_oil',
  VegetableOil = 'vegetable_oil',
  CannedTomatoes = 'canned_tomatoes',
  BlackBeans = 'black_beans',
  Chickpeas = 'chickpeas',
  Lentils = 'lentils',
  Oats = 'oats',
  Cereal = 'cereal',
  Coffee = 'coffee',
  Tea = 'tea',
  Honey = 'honey',
  Vinegar = 'vinegar',
  SoySauce = 'soy_sauce',
  HotSauce = 'hot_sauce',
  Onions = 'onions',
  Garlic = 'garlic',
  Potatoes = 'potatoes',
  Crackers = 'crackers',
  PeanutButter = 'peanut_butter',
  Jam = 'jam',
  FrozenPeas = 'frozen_peas',
  FrozenCorn = 'frozen_corn',
  IceCream = 'ice_cream',
  FrozenFish = 'frozen_fish',
  FrozenChicken = 'frozen_chicken',
  Raisins = 'raisins',
}

type InventoryIcon = {
  type: InventoryItemType;
  aliases: readonly string[];
  emoji?: string;
};

export type ItemIconResolution = {
  emoji: string;
  matched: boolean;
  itemType?: InventoryItemType;
};

const CATEGORY_FALLBACK_EMOJI: Record<ItemCategory | 'produce' | 'other', string> = {
  fridge: '❄️',
  pantry: '🧺',
  freezer: '🧊',
  produce: '🌿',
  other: '🧺',
};

const PRODUCE_TYPES = new Set<InventoryItemType>([
  InventoryItemType.Lettuce,
  InventoryItemType.Spinach,
  InventoryItemType.Broccoli,
  InventoryItemType.Carrots,
  InventoryItemType.Celery,
  InventoryItemType.BellPeppers,
  InventoryItemType.Tomatoes,
  InventoryItemType.Cucumber,
  InventoryItemType.Onions,
  InventoryItemType.Garlic,
  InventoryItemType.Potatoes,
  InventoryItemType.FrozenPeas,
  InventoryItemType.FrozenCorn,
]);

export const INVENTORY_ICON_REGISTRY: readonly InventoryIcon[] = [
  { type: InventoryItemType.Milk, aliases: ['milk'], emoji: '🥛' },
  { type: InventoryItemType.Eggs, aliases: ['egg', 'eggs'], emoji: '🥚' },
  { type: InventoryItemType.Butter, aliases: ['butter'], emoji: '🧈' },
  { type: InventoryItemType.Cheese, aliases: ['cheese'], emoji: '🧀' },
  { type: InventoryItemType.Yogurt, aliases: ['yogurt', 'yoghurt'], emoji: '🥣' },
  { type: InventoryItemType.ChickenBreast, aliases: ['chicken breast'], emoji: '🍗' },
  { type: InventoryItemType.GroundBeef, aliases: ['ground beef'], emoji: '🥩' },
  { type: InventoryItemType.Salmon, aliases: ['salmon'], emoji: '🐟' },
  { type: InventoryItemType.Lettuce, aliases: ['lettuce'], emoji: '🥬' },
  { type: InventoryItemType.Spinach, aliases: ['spinach'], emoji: '🥬' },
  { type: InventoryItemType.Broccoli, aliases: ['broccoli'], emoji: '🥦' },
  { type: InventoryItemType.Carrots, aliases: ['carrot', 'carrots'], emoji: '🥕' },
  { type: InventoryItemType.Celery, aliases: ['celery'], emoji: '🌿' },
  { type: InventoryItemType.BellPeppers, aliases: ['bell pepper', 'bell peppers', 'green bell pepper', 'red bell pepper', 'yellow bell pepper'], emoji: '🫑' },
  { type: InventoryItemType.Tomatoes, aliases: ['tomato', 'tomatoes'], emoji: '🍅' },
  { type: InventoryItemType.Cucumber, aliases: ['cucumber'], emoji: '🥒' },
  { type: InventoryItemType.OrangeJuice, aliases: ['orange juice'], emoji: '🧃' },
  { type: InventoryItemType.Cream, aliases: ['cream', 'heavy cream', 'whipping cream'], emoji: '🥛' },
  { type: InventoryItemType.SourCream, aliases: ['sour cream'], emoji: '🥛' },
  { type: InventoryItemType.Rice, aliases: ['rice', 'basmati rice', 'jasmine rice', 'brown rice'], emoji: '🍚' },
  { type: InventoryItemType.Pasta, aliases: ['pasta', 'spaghetti', 'penne', 'macaroni'], emoji: '🍝' },
  { type: InventoryItemType.Bread, aliases: ['bread'], emoji: '🍞' },
  { type: InventoryItemType.Flour, aliases: ['flour'], emoji: '🌾' },
  { type: InventoryItemType.Sugar, aliases: ['sugar', 'brown sugar', 'powdered sugar'], emoji: '🍬' },
  { type: InventoryItemType.Salt, aliases: ['salt'], emoji: '🧂' },
  { type: InventoryItemType.Pepper, aliases: ['pepper', 'black pepper', 'white pepper'], emoji: '🧂' },
  { type: InventoryItemType.OliveOil, aliases: ['olive oil'], emoji: '🫒' },
  { type: InventoryItemType.VegetableOil, aliases: ['vegetable oil', 'canola oil'], emoji: '🫙' },
  { type: InventoryItemType.CannedTomatoes, aliases: ['canned tomatoes', 'canned tomato'], emoji: '🥫' },
  { type: InventoryItemType.BlackBeans, aliases: ['black beans', 'black bean'], emoji: '🫘' },
  { type: InventoryItemType.Chickpeas, aliases: ['chickpeas', 'chickpea', 'garbanzo beans'], emoji: '🫘' },
  { type: InventoryItemType.Lentils, aliases: ['lentils', 'lentil'], emoji: '🫘' },
  { type: InventoryItemType.Oats, aliases: ['oats', 'oatmeal'], emoji: '🥣' },
  { type: InventoryItemType.Cereal, aliases: ['cereal'], emoji: '🥣' },
  { type: InventoryItemType.Coffee, aliases: ['coffee'], emoji: '☕' },
  { type: InventoryItemType.Tea, aliases: ['tea'], emoji: '🍵' },
  { type: InventoryItemType.Honey, aliases: ['honey'], emoji: '🍯' },
  { type: InventoryItemType.Vinegar, aliases: ['vinegar'], emoji: '🫙' },
  { type: InventoryItemType.SoySauce, aliases: ['soy sauce'], emoji: '🥢' },
  { type: InventoryItemType.HotSauce, aliases: ['hot sauce'], emoji: '🌶️' },
  { type: InventoryItemType.Onions, aliases: ['onion', 'onions'], emoji: '🧅' },
  { type: InventoryItemType.Garlic, aliases: ['garlic'], emoji: '🧄' },
  { type: InventoryItemType.Potatoes, aliases: ['potato', 'potatoes'], emoji: '🥔' },
  { type: InventoryItemType.Crackers, aliases: ['crackers', 'cracker'], emoji: '🍘' },
  { type: InventoryItemType.PeanutButter, aliases: ['peanut butter'], emoji: '🥜' },
  { type: InventoryItemType.Jam, aliases: ['jam', 'jelly'], emoji: '🍯' },
  { type: InventoryItemType.FrozenPeas, aliases: ['frozen peas'], emoji: '🫛' },
  { type: InventoryItemType.FrozenCorn, aliases: ['frozen corn'], emoji: '🌽' },
  { type: InventoryItemType.IceCream, aliases: ['ice cream'], emoji: '🍦' },
  { type: InventoryItemType.FrozenFish, aliases: ['frozen fish'], emoji: '🐟' },
  { type: InventoryItemType.FrozenChicken, aliases: ['frozen chicken'], emoji: '🍗' },
  { type: InventoryItemType.Raisins, aliases: ['raisin', 'raisins', 'golden raisins'] },
];

const EXACT_ICON_BY_NAME = new Map<string, InventoryIcon>();

for (const icon of INVENTORY_ICON_REGISTRY) {
  for (const alias of icon.aliases) {
    EXACT_ICON_BY_NAME.set(normalizeItemKey(alias), icon);
  }
}

export function normalizeItemKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function fallbackFor(category?: string | null, itemType?: InventoryItemType): string {
  if (itemType && PRODUCE_TYPES.has(itemType)) return CATEGORY_FALLBACK_EMOJI.produce;
  if (category === 'freezer') return CATEGORY_FALLBACK_EMOJI.freezer;
  if (category === 'fridge') return CATEGORY_FALLBACK_EMOJI.fridge;
  if (category === 'pantry') return CATEGORY_FALLBACK_EMOJI.pantry;
  return CATEGORY_FALLBACK_EMOJI.other;
}

export function resolveItemIcon(name: string, category?: string | null): ItemIconResolution {
  const icon = EXACT_ICON_BY_NAME.get(normalizeItemKey(name));
  if (!icon) {
    return { emoji: fallbackFor(category), matched: false };
  }
  return {
    emoji: icon.emoji ?? fallbackFor(category, icon.type),
    matched: Boolean(icon.emoji),
    itemType: icon.type,
  };
}

export function getItemEmoji(name: string, category?: string | null): string {
  return resolveItemIcon(name, category).emoji;
}
