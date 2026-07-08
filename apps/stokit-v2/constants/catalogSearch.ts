import type { Unit } from '../types';
import {
  PANTRY_CATALOG,
  type PantryCatalogCategory,
  type PantryCatalogItem,
} from './pantryCatalog';
import { classifyItem } from '../core/services/itemClassifier';
import { resolveItemIconString } from './itemAssetResolver';

export const CATALOG_SEARCH_LIMIT = 48;

type Family = {
  category: PantryCatalogCategory;
  icon: string;
  unit: Unit;
  bases: string[];
  prefixes: string[];
  suffixes: string[];
  aliases?: string[];
};

const FAMILIES: Family[] = [
  { category: 'Produce', icon: '🥬', unit: 'unit', bases: ['apple', 'banana', 'plantain', 'orange', 'pear', 'grape', 'berry', 'melon', 'mango', 'peach', 'plum', 'persimmon', 'dragon fruit', 'jackfruit', 'guava', 'papaya', 'tomato', 'potato', 'onion', 'carrot', 'pepper', 'lettuce', 'spinach', 'cabbage', 'mushroom', 'squash', 'cucumber', 'avocado', 'broccoli', 'okra', 'cassava', 'taro', 'eggplant', 'aubergine', 'cilantro', 'coriander', 'herbs'], prefixes: ['organic', 'fresh', 'ripe', 'local', 'green', 'red', 'yellow', 'baby', 'sweet', 'large', 'small', 'seedless'], suffixes: ['bag', 'bunch', 'mix', 'pack', 'whole', 'sliced'] },
  { category: 'Dairy', icon: '🥛', unit: 'unit', bases: ['milk', 'yogurt', 'cheese', 'cream', 'butter', 'kefir', 'cottage cheese', 'cream cheese', 'sour cream', 'whipped cream'], prefixes: ['whole', 'low fat', 'fat free', 'organic', 'lactose free', 'plain', 'vanilla', 'strawberry', 'Greek', 'unsalted', 'salted', 'shredded'], suffixes: ['carton', 'tub', 'cups', 'slices', 'block', 'pack'], aliases: ['dairy alternative', 'non dairy'] },
  { category: 'Meat', icon: '🥩', unit: 'lb', bases: ['chicken', 'beef', 'turkey', 'pork', 'lamb', 'sausage', 'bacon', 'ham', 'steak', 'ground meat', 'deli meat', 'meatballs'], prefixes: ['organic', 'fresh', 'frozen', 'lean', 'extra lean', 'boneless', 'skinless', 'smoked', 'seasoned', 'grass fed'], suffixes: ['breast', 'thighs', 'strips', 'cutlets', 'roast', 'pack'] },
  { category: 'Seafood', icon: '🐟', unit: 'lb', bases: ['salmon', 'tuna', 'shrimp', 'cod', 'tilapia', 'trout', 'crab', 'lobster', 'scallops', 'mussels', 'sardines', 'fish'], prefixes: ['fresh', 'frozen', 'wild caught', 'smoked', 'cooked', 'raw', 'peeled', 'seasoned'], suffixes: ['fillets', 'portions', 'pack', 'steaks', 'tails', 'can'] },
  { category: 'Bakery', icon: '🍞', unit: 'pack', bases: ['bread', 'bagels', 'buns', 'rolls', 'tortillas', 'pita', 'naan', 'croissants', 'muffins', 'donuts', 'cake', 'cookies', 'crackers'], prefixes: ['white', 'wheat', 'whole grain', 'multigrain', 'gluten free', 'fresh', 'mini', 'large', 'plain', 'cinnamon', 'chocolate'], suffixes: ['loaf', 'pack', 'slices', 'mix', 'box'] },
  { category: 'Frozen', icon: '❄️', unit: 'pack', bases: ['pizza', 'vegetables', 'fruit', 'fries', 'waffles', 'pancakes', 'meals', 'dumplings', 'burritos', 'fish', 'chicken', 'meatballs', 'ice cream'], prefixes: ['frozen', 'family size', 'organic', 'mini', 'mixed', 'ready to cook', 'gluten free', 'vegetarian'], suffixes: ['bag', 'box', 'pack', 'tray', 'bites'] },
  { category: 'Dry Goods', icon: '🍚', unit: 'pack', bases: ['rice', 'basmati rice', 'jasmine rice', 'pasta', 'noodles', 'ramen', 'oats', 'cereal', 'flour', 'semolina', 'fufu flour', 'teff', 'millet', 'sugar', 'lentils', 'beans', 'chickpeas', 'quinoa', 'couscous', 'bulgur', 'freekeh', 'barley', 'granola'], prefixes: ['white', 'brown', 'whole grain', 'organic', 'instant', 'quick', 'long grain', 'gluten free', 'high protein', 'family size'], suffixes: ['bag', 'box', 'pack', 'mix', 'cups'] },
  { category: 'Canned', icon: '🥫', unit: 'can', bases: ['tomatoes', 'beans', 'corn', 'peas', 'tuna', 'salmon', 'soup', 'broth', 'chili', 'fruit', 'olives', 'pickles', 'coconut milk', 'tomato sauce'], prefixes: ['canned', 'diced', 'crushed', 'whole', 'organic', 'low sodium', 'no salt added', 'spicy', 'ready to eat'], suffixes: ['can', 'jar', 'pack', 'case'] },
  { category: 'Spices', icon: '🌿', unit: 'unit', bases: ['salt', 'pepper', 'cinnamon', 'cumin', 'paprika', 'turmeric', 'garlic powder', 'onion powder', 'oregano', 'basil', 'thyme', 'rosemary', 'curry powder', 'garam masala', 'zaatar', 'sumac', 'harissa', 'berbere', 'ras el hanout', 'gochujang', 'miso', 'tahini', 'sriracha', 'hoisin sauce', 'fish sauce', 'seasoning'], prefixes: ['ground', 'whole', 'organic', 'smoked', 'sweet', 'hot', 'mild', 'coarse', 'fine'], suffixes: ['jar', 'bottle', 'packet', 'blend', 'refill'] },
  { category: 'Drinks', icon: '🥤', unit: 'pack', bases: ['water', 'sparkling water', 'juice', 'soda', 'coffee', 'tea', 'sports drink', 'energy drink', 'lemonade', 'coconut water', 'yogurt drink', 'doogh', 'ayran'], prefixes: ['plain', 'diet', 'zero sugar', 'organic', 'unsweetened', 'sweetened', 'caffeine free', 'vanilla', 'lemon', 'berry', 'orange'], suffixes: ['bottles', 'cans', 'carton', 'pack', 'pods', 'bags'] },
  { category: 'Snacks', icon: '🍿', unit: 'pack', bases: ['chips', 'crackers', 'popcorn', 'nuts', 'trail mix', 'pretzels', 'granola bars', 'protein bars', 'fruit snacks', 'jerky', 'rice cakes', 'cookies'], prefixes: ['salted', 'unsalted', 'spicy', 'sweet', 'organic', 'mini', 'family size', 'cheese', 'barbecue', 'sea salt'], suffixes: ['bag', 'box', 'pack', 'bites', 'variety pack'] },
  { category: 'Kitchen', icon: '🍽️', unit: 'pack', bases: ['plates', 'bowls', 'cups', 'forks', 'spoons', 'knives', 'food containers', 'foil', 'plastic wrap', 'zip bags', 'sponges', 'dish towels', 'coffee filters'], prefixes: ['paper', 'plastic', 'reusable', 'disposable', 'large', 'small', 'heavy duty', 'clear', 'compostable'], suffixes: ['pack', 'box', 'roll', 'set', 'refill'] },
  { category: 'Cleaning', icon: '🧽', unit: 'unit', bases: ['dish soap', 'hand soap', 'laundry detergent', 'fabric softener', 'bleach', 'cleaner', 'glass cleaner', 'wipes', 'trash bags', 'sponges', 'mop pads', 'dishwasher detergent'], prefixes: ['unscented', 'lemon', 'fresh scent', 'concentrated', 'antibacterial', 'eco friendly', 'heavy duty', 'free and clear'], suffixes: ['bottle', 'spray', 'refill', 'pods', 'pack', 'wipes'] },
  { category: 'Paper Goods', icon: '🧻', unit: 'pack', bases: ['toilet paper', 'paper towels', 'tissues', 'napkins', 'paper plates', 'paper cups', 'parchment paper', 'paper bags'], prefixes: ['soft', 'strong', 'recycled', 'premium', 'large', 'small', 'heavy duty', 'compostable'], suffixes: ['rolls', 'box', 'pack', 'case'] },
  { category: 'Personal Care', icon: '🧴', unit: 'unit', bases: ['toothpaste', 'toothbrush', 'shampoo', 'conditioner', 'body wash', 'deodorant', 'lotion', 'razors', 'shaving cream', 'face wash', 'mouthwash', 'floss', 'sunscreen'], prefixes: ['sensitive', 'unscented', 'moisturizing', 'gentle', 'travel size', 'family size', 'natural', 'mint', 'fresh', 'daily'], suffixes: ['bottle', 'tube', 'pack', 'refill', 'set'] },
  { category: 'Baby', icon: '👶', unit: 'pack', bases: ['diapers', 'baby wipes', 'baby food', 'formula', 'baby lotion', 'baby wash', 'training pants', 'baby snacks'], prefixes: ['newborn', 'sensitive', 'unscented', 'organic', 'gentle', 'travel', 'large', 'small'], suffixes: ['pack', 'box', 'refill', 'pouches', 'jars'] },
  { category: 'Pet', icon: '🐾', unit: 'pack', bases: ['dog food', 'cat food', 'pet treats', 'cat litter', 'dog treats', 'bird food', 'fish food', 'pet shampoo', 'waste bags'], prefixes: ['dry', 'wet', 'grain free', 'senior', 'puppy', 'kitten', 'natural', 'large', 'small'], suffixes: ['bag', 'cans', 'box', 'pack', 'pouches'] },
];

type SearchableItem = PantryCatalogItem & {
  searchText: string;
  curated: boolean;
  conceptKey: string;
};

const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const idFor = (name: string) => `extended-${normalize(name).replace(/\s+/g, '-')}`;
const titleCase = (value: string) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());

const buildCatalog = (): SearchableItem[] => {
  const byName = new Map<string, SearchableItem>();
  for (const catalogItem of PANTRY_CATALOG) {
    const key = normalize(catalogItem.name);
    byName.set(key, {
      ...catalogItem,
      searchText: normalize([catalogItem.name, catalogItem.category, ...(catalogItem.keywords ?? [])].join(' ')),
      curated: true,
      conceptKey: key,
    });
  }
  for (const family of FAMILIES) {
    for (const base of family.bases) {
      const semanticIcon = resolveItemIconString(base, classifyItem(base).emoji);
      const names = [
        base,
        ...family.prefixes.map((prefix) => `${prefix} ${base}`),
        ...family.suffixes.map((suffix) => `${base} ${suffix}`),
        ...family.prefixes.flatMap((prefix) => family.suffixes.map((suffix) => `${prefix} ${base} ${suffix}`)),
      ];
      for (const name of names) {
        const key = normalize(name);
        if (byName.has(key)) continue;
        byName.set(key, {
          id: idFor(name),
          name: titleCase(name),
          category: family.category,
          icon: semanticIcon,
          defaultUnit: family.unit,
          keywords: family.aliases,
          searchText: normalize([name, family.category, ...(family.aliases ?? [])].join(' ')),
          curated: false,
          conceptKey: normalize(base),
        });
      }
    }
  }
  return [...byName.values()];
};

let searchableCatalog: SearchableItem[] | null = null;
let catalogByName: Map<string, SearchableItem> | null = null;

const getCatalog = () => {
  if (!searchableCatalog) searchableCatalog = buildCatalog();
  return searchableCatalog;
};

const getCatalogByName = () => {
  if (!catalogByName) catalogByName = new Map(getCatalog().map((item) => [normalize(item.name), item]));
  return catalogByName;
};

export function getExtendedCatalogSize(): number {
  return getCatalog().length;
}

export function hasExactCatalogMatch(query: string): boolean {
  return getCatalogByName().has(normalize(query));
}

export function searchPantryCatalog(query: string, limit = CATALOG_SEARCH_LIMIT): PantryCatalogItem[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const tokens = normalized.split(' ');
  const ranked = getCatalog()
    .map((item) => {
      const name = normalize(item.name);
      if (!tokens.every((token) => item.searchText.includes(token))) return null;
      if (tokens.length === 1 && !item.curated && !item.conceptKey.includes(tokens[0])) return null;
      const score =
        (name === normalized ? 10000 : 0) +
        (name.startsWith(normalized) ? 3000 : 0) +
        (name.includes(normalized) ? 1000 : 0) +
        (item.curated ? 500 : 0) -
        (item.curated || name === item.conceptKey ? 0 : 750) -
        name.length;
      return { item, score };
    })
    .filter((result): result is { item: SearchableItem; score: number } => result !== null)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  const seenConcepts = new Set<string>();
  const results: PantryCatalogItem[] = [];
  for (const { item } of ranked) {
    if (seenConcepts.has(item.conceptKey)) continue;
    seenConcepts.add(item.conceptKey);
    const { searchText: _searchText, curated: _curated, conceptKey: _conceptKey, ...result } = item;
    results.push(result);
    if (results.length === limit) break;
  }
  return results;
}
