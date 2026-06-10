import type { ItemCategory } from '../constants/defaultItems';

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand: string | null;
  category: ItemCategory;
  storageLabel: string;
  estimatedLifeLabel: string;
}

const LOOKUP_TIMEOUT_MS = 5_000;

function timeoutSignal(): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  return controller.signal;
}

// PLU codes for common fresh produce (4-5 digit in-store codes, not in any barcode DB)
const PLU_MAP: Record<string, { name: string; category: ItemCategory }> = {
  '3000': { name: 'Banana', category: 'fridge' },
  '3001': { name: 'Banana Organic', category: 'fridge' },
  '3283': { name: 'Mango', category: 'fridge' },
  '4011': { name: 'Banana', category: 'fridge' },
  '4016': { name: 'Apple (Granny Smith)', category: 'fridge' },
  '4021': { name: 'Apple (Red Delicious)', category: 'fridge' },
  '4046': { name: 'Avocado (Hass)', category: 'fridge' },
  '4053': { name: 'Broccoli', category: 'fridge' },
  '4054': { name: 'Lime', category: 'fridge' },
  '4065': { name: 'Green Bell Pepper', category: 'fridge' },
  '4066': { name: 'Red Bell Pepper', category: 'fridge' },
  '4069': { name: 'Yellow Bell Pepper', category: 'fridge' },
  '4072': { name: 'Cauliflower', category: 'fridge' },
  '4078': { name: 'Cucumber', category: 'fridge' },
  '4082': { name: 'Garlic', category: 'pantry' },
  '4096': { name: 'Kiwi', category: 'fridge' },
  '4129': { name: 'Lemon', category: 'fridge' },
  '4131': { name: 'Apple (Fuji)', category: 'fridge' },
  '4151': { name: 'Onion (Yellow)', category: 'pantry' },
  '4152': { name: 'Onion (Red)', category: 'pantry' },
  '4164': { name: 'Orange', category: 'fridge' },
  '4196': { name: 'Potato (Russet)', category: 'pantry' },
  '4225': { name: 'Avocado', category: 'fridge' },
  '4252': { name: 'Strawberry', category: 'fridge' },
  '4584': { name: 'Apple (Gala)', category: 'fridge' },
};

export function inferCategory(name: string, categories: string = ''): ItemCategory {
  const text = `${name} ${categories}`.toLowerCase();

  // ── Non-food / personal-care / household-cleaning ──────────────────────────
  // Check FIRST so incidental food words ("cream", "butter") inside a product
  // name like "Dial Coconut Cream Hand Soap" don't mis-classify it as fridge.
  if (/\b(soap|hand.?wash|body.?wash|dish.?(soap|wash|liquid)|shampoo|conditioner|hair.?(care|mask|serum|oil|spray|gel)|lotion|moisturis|moisturiz|body.?lotion|face.?(wash|cream|scrub|serum|mask)|sunscreen|spf|deodorant|antiperspirant|toothpaste|mouthwash|dental|floss|razor|shav(e|ing)|aftershave|sanitizer|hand.?sanitizer|disinfect|bleach|all.?purpose.?clean|bathroom|toilet|paper.?towel|napkin|tissue|wipe|baby.?wipe|diaper|tampon|pad\b|feminine|cotton.?ball|q.?tip|bandage|first.?aid|vitamin|supplement|protein.?powder|laundry|detergent|fabric|softener|dryer|dish.?washer)\b/.test(text)) return 'pantry';

  // ── Frozen ─────────────────────────────────────────────────────────────────
  if (/\b(frozen|freezer|popsicle|sorbet|gelato)\b/.test(text)) return 'freezer';
  // "ice cream" handled separately so it doesn't shadow the non-food "cream" match above
  if (/\bice.?cream\b/.test(text)) return 'freezer';

  // ── Refrigerated food ──────────────────────────────────────────────────────
  if (/\b(milk|cheese|yogurt|yoghurt|butter|cream|eggs?|meat|beef|chicken|turkey|pork|lamb|fish|salmon|tuna|shrimp|prawn|seafood|lobster|crab|deli|bacon|ham|sausage|salami|pepperoni|lettuce|spinach|kale|arugula|chard|broccoli|cauliflower|asparagus|artichoke|carrot|celery|pepper|tomato|cucumber|zucchini|squash|mushroom|scallion|leek|avocado|guacamole|mango|papaya|pineapple|kiwi|melon|cantaloupe|watermelon|berry|berries|strawberr|blueberr|raspberr|blackberr|cranberr|grape|cherry|peach|plum|apricot|nectarine|apple|pear|orange|lemon|lime|grapefruit|clementine|tangerine|mandarin|basil|cilantro|parsley|dill|mint|rosemary|thyme|tofu|tempeh|hummus|juice|produce|fresh|refrigerat|dairy|chilled)\b/.test(text)) return 'fridge';

  return 'pantry';
}

function storageForCategory(category: ItemCategory): Pick<BarcodeProduct, 'storageLabel' | 'estimatedLifeLabel'> {
  if (category === 'freezer') return { storageLabel: 'Freezer', estimatedLifeLabel: 'about 3 months' };
  if (category === 'fridge')  return { storageLabel: 'Fridge',  estimatedLifeLabel: 'about 7 days' };
  return { storageLabel: 'Pantry', estimatedLifeLabel: 'about 30 days' };
}

// ── Lookup sources ─────────────────────────────────────────────────────────

// 1. Open Food Facts — no key, best global branded coverage
async function lookupOpenFoodFacts(code: string): Promise<BarcodeProduct | null> {
  const codesToTry = [code];
  // If it's a 12-digit UPC, OFF often stores it with a leading zero (EAN-13 format)
  if (code.length === 12) codesToTry.push(`0${code}`);

  for (const c of codesToTry) {
    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}.json?fields=product_name,product_name_en,generic_name,brands,categories,categories_tags`,
        { headers: { Accept: 'application/json', 'User-Agent': 'Stokit/1.0' }, signal: timeoutSignal() },
      );
      if (response.ok) {
        const payload = await response.json();
        if (payload?.status === 1 && payload?.product) {
          const p = payload.product;
          const productName = String(p.product_name || p.product_name_en || p.generic_name || '').trim();
          if (productName) {
            const categories = [
              p.categories,
              ...(Array.isArray(p.categories_tags) ? p.categories_tags : []),
            ].filter(Boolean).join(' ');
            const category = inferCategory(productName, categories);

            return {
              barcode: code, // Return the originally scanned code
              name: productName,
              brand: String(p.brands ?? '').split(',')[0]?.trim() || null,
              category,
              ...storageForCategory(category),
            };
          }
        }
      }
    } catch {
      // Ignore network errors and try the next padded code
    }
  }
  return null;
}

// 2. UPC Item DB — free trial, limited but useful
async function lookupUpcItemDb(code: string): Promise<BarcodeProduct | null> {
  const response = await fetch(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
    { headers: { Accept: 'application/json' }, signal: timeoutSignal() },
  );
  if (!response.ok) return null;
  const payload = await response.json();
  const item = payload?.items?.[0];
  if (!item?.title) return null;
  const name = String(item.title).trim();
  const category = inferCategory(name, item.category ?? '');
  return {
    barcode: code,
    name,
    brand: item.brand || null,
    category,
    ...storageForCategory(category),
  };
}

// ── Parallel race: resolves as soon as the first source finds a result ─────
function firstNonNull<T>(promises: Promise<T | null>[]): Promise<T | null> {
  return new Promise((resolve) => {
    let pending = promises.length;
    if (pending === 0) { resolve(null); return; }
    let won = false;
    for (const p of promises) {
      p.then((val) => {
        if (!won && val !== null) { won = true; resolve(val); }
      }).catch(() => {}).finally(() => {
        pending--;
        if (pending === 0 && !won) resolve(null);
      });
    }
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchBarcodeProduct(barcode: string): Promise<BarcodeProduct | null> {
  const code = barcode.trim();
  if (!code) return null;

  // PLU codes (4-5 digits) are fresh produce in-store price codes — not in any barcode DB
  if (/^\d{4,5}$/.test(code)) {
    const plu = PLU_MAP[code];
    if (plu) {
      return {
        barcode: code,
        name: plu.name,
        brand: null,
        category: plu.category,
        ...storageForCategory(plu.category),
      };
    }
    return null;
  }

  // Fire available sources in parallel — return the first hit
  return firstNonNull([
    lookupOpenFoodFacts(code).catch(() => null),
    lookupUpcItemDb(code).catch(() => null),
  ]);
}
