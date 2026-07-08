import { PANTRY_CATALOG, type PantryCatalogCategory, type PantryCatalogItem } from './pantryCatalog';

export type ResolvedItemAsset =
  | { kind: 'image'; source: any }
  | { kind: 'mdi'; name: string }
  | { kind: 'emoji'; value: string }
  | { kind: 'placeholder' };

// Requires are deferred inside the switch (rather than an eager object-literal
// map) so this module can be imported by plain-Node test runners — which have
// no Metro asset transform and would crash trying to load a .png as JS —
// without ever touching the filesystem unless a custom: icon is actually
// resolved. Metro still statically analyzes each `require('./literal.png')`
// call fine regardless of where it sits in the file.
function getCustomEmojiSource(icon: string): any {
  switch (icon) {
    case 'custom:toothpaste': return require('../assets/custom-emojis/toothpaste.png');
    case 'custom:shampoo': return require('../assets/custom-emojis/shampoo.png');
    case 'custom:conditioner': return require('../assets/custom-emojis/conditioner.png');
    case 'custom:bodywash': return require('../assets/custom-emojis/bodywash.png');
    case 'custom:deodorant': return require('../assets/custom-emojis/deodorant.png');
    case 'custom:lotion': return require('../assets/custom-emojis/lotion.png');
    case 'custom:dishsoap': return require('../assets/custom-emojis/dishsoap.png');
    case 'custom:handsoap': return require('../assets/custom-emojis/handsoap.png');
    case 'custom:laundry_detergent': return require('../assets/custom-emojis/laundry_detergent.png');
    case 'custom:fabric_softener': return require('../assets/custom-emojis/fabric_softener.png');
    case 'custom:bleach': return require('../assets/custom-emojis/bleach.png');
    case 'custom:all_purpose_cleaner': return require('../assets/custom-emojis/all_purpose_cleaner.png');
    case 'custom:glass_cleaner': return require('../assets/custom-emojis/glass_cleaner.png');
    case 'custom:wipes': return require('../assets/custom-emojis/wipes.png');
    case 'custom:trash_bags': return require('../assets/custom-emojis/trash_bags.png');
    case 'custom:ketchup': return require('../assets/custom-emojis/ketchup.png');
    case 'custom:mustard': return require('../assets/custom-emojis/mustard.png');
    default: return undefined;
  }
}

// Icons for commonly typed items that are not in the catalog
const ITEM_ICON: Record<string, string> = {
  'hummus': '🫙', 'salsa': '🫙', 'guacamole': '🥑', 'ranch': '🫙',
  'ranch dressing': '🫙', 'bbq sauce': '🫙', 'sriracha': '🌶️',
  'teriyaki': '🫙', 'teriyaki sauce': '🫙', 'tahini': '🫙',
  'pesto': '🌿', 'marinara': '🍅', 'pasta sauce': '🍅', 'alfredo': '🫙',
  'baking soda': '🌾', 'baking powder': '🌾', 'vanilla extract': '🫙',
  'chocolate chips': '🍫', 'brown sugar': '🍬', 'cocoa powder': '🍫',
  'yeast': '🌾', 'cornstarch': '🌾',
  'beer': '🍺', 'wine': '🍷', 'vodka': '🥃', 'whiskey': '🥃',
  'kombucha': '🫙', 'iced tea': '🧃', 'lemonade': '🧃',
  'sweet potato': '🍠', 'yam': '🍠', 'mushroom': '🍄', 'mushrooms': '🍄',
  'jalapeño': '🌶️', 'jalapeno': '🌶️', 'zucchini': '🥒', 'asparagus': '🥦',
  'kale': '🥬', 'mango': '🥭', 'peach': '🍑', 'pear': '🍐',
  'cherry': '🍒', 'cherries': '🍒', 'pineapple': '🍍', 'coconut': '🥥',
  'kiwi': '🥝', 'grapefruit': '🍊', 'basil': '🌿', 'cilantro': '🌿',
  'parsley': '🌿', 'rosemary': '🌿', 'thyme': '🌿', 'dill': '🌿',
  'ham': '🥩', 'pork': '🥩', 'salami': '🥩', 'pepperoni': '🥩',
  'tofu': '🍱', 'tempeh': '🍱',
  'oysters': '🦪', 'clams': '🦪', 'scallops': '🦐',
  'broth': '🍲', 'chicken broth': '🍲', 'beef broth': '🍲',
  'vegetable broth': '🍲', 'stock': '🍲', 'coconut milk': '🥛',
  'sunscreen': '☀️', 'dental floss': '🦷', 'floss': '🦷',
  'mouthwash': '🫙', 'cotton balls': 'mdi:package-variant-closed', 'lip balm': '💄',
  'vitamins': '💊', 'ibuprofen': '💊', 'tylenol': '💊', 'aspirin': '💊',
  'protein powder': '💪', 'band aid': '🩹', 'bandaids': '🩹',
  'batteries': '🔋', 'light bulbs': '💡', 'candle': '🕯️',
  'air freshener': '🌸', 'matches': '🔥',

  // Common items with no dedicated catalog entry — closest safe existing icon
  'pepper': '🌶️', 'beef': '🥩', 'fish': '🐟', 'cream': '🫗',
  'berries': '🍓', 'soap': '🧼', 'bar soap': '🧼',
  'detergent': 'custom:laundry_detergent', 'foil': 'mdi:paper-roll-outline',
  'stock cube': '🍲', 'bouillon': '🍲', 'bouillon cube': '🍲',
  'mayo': '🫙',

  // Mission-required aliases/synonyms (targets already covered by the
  // catalog or the entries above — only the synonym itself is new here)
  'capsicum': '🫑',
  'coriander': '🌿',
  'scallion': '🧅', 'green onion': '🧅',
  'minced beef': '🥩',
  'soft drink': '🥤',
  'kitchen towel': '🧻',
};

// Safe per-category fallback — guarantees no blank box
const CATEGORY_ICON: Record<string, string> = {
  'Produce': '🥬', 'Dairy': '🥛', 'Meat': '🥩', 'Seafood': '🐟',
  'Bakery': '🍞', 'Frozen': '🧊', 'Dry Goods': '🌾', 'Canned': '🥫',
  'Spices': '🧂', 'Drinks': '🥤', 'Snacks': '🍿', 'Kitchen': '🍽️',
  'Cleaning': '🧹', 'Paper Goods': '🧻', 'Personal Care': '🧴',
  'Baby': '👶', 'Pet': '🐾', 'Other': '🛒',
  'Automotive': '🚗', 'Hardware': '🧰', 'Health': '💊', 'Office': '🗂️',
};

// Lowercase, trim, collapse whitespace, and strip simple punctuation before
// any lookup — keeps matching resilient to how a name was typed.
export function normalizeForIcon(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:"'’]/g, '')
    .replace(/\s+/g, ' ');
}

// Tries an exact match first, then tolerates a simple trailing-"s" plural
// mismatch in either direction (input vs. stored key) without ever mangling
// words that merely end in "s" but aren't plural (e.g. "hummus").
function lookupTolerant<T>(map: Record<string, T>, normalized: string): T | undefined {
  if (map[normalized] !== undefined) return map[normalized];
  if (normalized.length > 4 && normalized.endsWith('s') && !normalized.endsWith('ss')) {
    const singular = normalized.slice(0, -1);
    if (map[singular] !== undefined) return map[singular];
  }
  const plural = `${normalized}s`;
  if (map[plural] !== undefined) return map[plural];
  return undefined;
}

const CATALOG_BY_NAME: Record<string, PantryCatalogItem> = {};
for (const catalogItem of PANTRY_CATALOG) {
  const key = normalizeForIcon(catalogItem.name);
  if (CATALOG_BY_NAME[key] === undefined) CATALOG_BY_NAME[key] = catalogItem;
}

/** Category of the closest curated catalog match for a free-text name, if any. */
export function lookupCatalogCategory(name: string): PantryCatalogCategory | undefined {
  return lookupTolerant(CATALOG_BY_NAME, normalizeForIcon(name))?.category;
}

/**
 * Deterministic icon-string resolution chain for a free-text item name:
 * curated catalog exact/alias match -> known alias table -> caller-supplied
 * fallback (e.g. itemClassifier's keyword guess) -> per-category safety net.
 * Never returns undefined — matches every existing render site's "no blank
 * box" guarantee.
 */
export function resolveItemIconString(name: string, fallbackEmoji?: string): string {
  const normalized = normalizeForIcon(name);
  const catalogItem = lookupTolerant(CATALOG_BY_NAME, normalized);
  const category = catalogItem?.category ?? 'Other';
  return (
    catalogItem?.icon ||
    lookupTolerant(ITEM_ICON, normalized) ||
    fallbackEmoji ||
    CATEGORY_ICON[category] ||
    CATEGORY_ICON.Other
  );
}

/** Parses a raw icon string (mdi:*, custom:*, or plain emoji) into a render-ready asset descriptor. */
export function resolveIconString(icon: string): ResolvedItemAsset {
  if (icon.startsWith('custom:')) {
    const source = getCustomEmojiSource(icon);
    return source ? { kind: 'image', source } : { kind: 'placeholder' };
  }
  if (icon.startsWith('mdi:')) {
    return { kind: 'mdi', name: icon.slice(4) };
  }
  return { kind: 'emoji', value: icon };
}

/** End-to-end: free-text item name -> render-ready asset descriptor. */
export function resolveItemAsset(name: string, fallbackEmoji?: string): ResolvedItemAsset {
  return resolveIconString(resolveItemIconString(name, fallbackEmoji));
}
