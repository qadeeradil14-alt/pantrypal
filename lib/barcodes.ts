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

function inferCategory(name: string, categories: string): ItemCategory {
  const text = `${name} ${categories}`.toLowerCase();
  if (/\b(frozen|ice cream|freezer)\b/.test(text)) return 'freezer';
  if (/\b(milk|cheese|yogurt|butter|cream|eggs|meat|beef|chicken|turkey|pork|fish|salmon|shrimp|lettuce|spinach|broccoli|carrot|celery|pepper|tomato|cucumber|juice|produce|fresh|fruit|vegetable)\b/.test(text)) return 'fridge';
  return 'pantry';
}

function storageForCategory(category: ItemCategory): Pick<BarcodeProduct, 'storageLabel' | 'estimatedLifeLabel'> {
  if (category === 'freezer') return { storageLabel: 'Freezer', estimatedLifeLabel: 'about 3 months' };
  if (category === 'fridge') return { storageLabel: 'Fridge', estimatedLifeLabel: 'about 7 days' };
  return { storageLabel: 'Pantry', estimatedLifeLabel: 'about 30 days' };
}

// Open Food Facts — no key needed, best global coverage
async function lookupOpenFoodFacts(code: string): Promise<BarcodeProduct | null> {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,categories,categories_tags`,
    { headers: { Accept: 'application/json', 'User-Agent': 'Stokit/1.0' }, signal: timeoutSignal() },
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`OpenFoodFacts ${response.status}`);

  const payload = await response.json();
  if (payload?.status !== 1 || !payload?.product) return null;

  const productName = String(payload.product.product_name ?? '').trim();
  if (!productName) return null;

  const categories = [
    payload.product.categories,
    ...(Array.isArray(payload.product.categories_tags) ? payload.product.categories_tags : []),
  ].filter(Boolean).join(' ');
  const category = inferCategory(productName, categories);

  return {
    barcode: code,
    name: productName,
    brand: String(payload.product.brands ?? '').split(',')[0]?.trim() || null,
    category,
    ...storageForCategory(category),
  };
}

// barcode.monster — free, no key needed, strong US grocery coverage
async function lookupBarcodeMonster(code: string): Promise<BarcodeProduct | null> {
  try {
    const response = await fetch(
      `https://barcode.monster/api/${encodeURIComponent(code)}`,
      { headers: { Accept: 'application/json' }, signal: timeoutSignal() },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const name = String(payload?.description ?? '').trim();
    if (!name) return null;

    const category = inferCategory(name, payload?.category ?? '');
    return {
      barcode: code,
      name,
      brand: String(payload?.brand ?? '').trim() || null,
      category,
      ...storageForCategory(category),
    };
  } catch {
    return null;
  }
}

// UPC Item DB — free trial, last resort
async function lookupUpcItemDb(code: string): Promise<BarcodeProduct | null> {
  try {
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
  } catch {
    return null;
  }
}

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
    // Unknown PLU — return null so user can add manually, don't show "failed"
    return null;
  }

  // Three-stage lookup: Open Food Facts → barcode.monster → UPC Item DB
  try {
    const offResult = await lookupOpenFoodFacts(code);
    if (offResult) return offResult;
  } catch { /* try next */ }

  try {
    const monsterResult = await lookupBarcodeMonster(code);
    if (monsterResult) return monsterResult;
  } catch { /* try next */ }

  return lookupUpcItemDb(code);
}
