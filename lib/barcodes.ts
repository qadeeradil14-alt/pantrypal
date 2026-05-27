import type { ItemCategory } from '../constants/defaultItems';

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand: string | null;
  category: ItemCategory;
  storageLabel: string;
  estimatedLifeLabel: string;
}

function inferCategory(name: string, categories: string): ItemCategory {
  const text = `${name} ${categories}`.toLowerCase();

  if (/\b(frozen|ice cream|freezer)\b/.test(text)) return 'freezer';
  if (/\b(milk|cheese|yogurt|butter|cream|eggs|meat|beef|chicken|turkey|pork|fish|salmon|shrimp|lettuce|spinach|broccoli|carrot|celery|pepper|tomato|cucumber|juice)\b/.test(text)) return 'fridge';

  return 'pantry';
}

function storageForCategory(category: ItemCategory): Pick<BarcodeProduct, 'storageLabel' | 'estimatedLifeLabel'> {
  if (category === 'freezer') {
    return { storageLabel: 'Freezer', estimatedLifeLabel: 'about 3 months' };
  }
  if (category === 'fridge') {
    return { storageLabel: 'Fridge', estimatedLifeLabel: 'about 7 days' };
  }
  return { storageLabel: 'Pantry', estimatedLifeLabel: 'about 30 days' };
}

export async function fetchBarcodeProduct(barcode: string): Promise<BarcodeProduct | null> {
  const code = barcode.trim();
  if (!code) return null;

  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,categories,categories_tags`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PantryPal/1.0',
      },
    },
  );

  if (!response.ok) {
    throw new Error('Product lookup failed.');
  }

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
