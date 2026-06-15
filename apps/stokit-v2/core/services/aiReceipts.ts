import { config, hasOpenAiKey } from '../../lib/config';
import { supabase } from '../../lib/supabase';

export type ItemCategory = 'food' | 'household' | 'personal_care' | 'non_grocery';

export interface ScannedItem {
  name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  item_category: ItemCategory;
  unit?: string;
  price?: number;
}

export interface ReceiptScanResult {
  store_name: string | null;
  transaction_date: string | null;
  total_amount: number | null;
  items: ScannedItem[];
  total?: number | null;
}

const PROMPT = `Analyze this receipt image and extract the data as JSON. Return ONLY pure, valid JSON — no markdown, no \`\`\`json blocks, no prose before or after.

Exact output structure:
{
  "store_name": "store name or null",
  "transaction_date": "YYYY-MM-DD or null",
  "total_amount": 0.00,
  "items": [
    { "name": "item name", "quantity": 1, "unit_price": 0.00, "total_price": 0.00, "item_category": "food" }
  ]
}

DATE EXTRACTION — critical:
- Read the EXACT date printed on the receipt. Do NOT guess or infer.
- Common formats: MM/DD/YY, MM/DD/YYYY, MM-DD-YY, Month DD YYYY, DD/MM/YYYY.
- Convert to YYYY-MM-DD. Example: "05/27/26" → "2026-05-27". Do NOT subtract one day.
- If no date is visible, return null.

ITEMS — include every purchasable line item. Rules:
- Skip tax lines, subtotals, totals, discounts/coupons, and loyalty-card savings lines — these are NOT items.
- If a line shows a discount for an item (e.g. "MEMBER SAVINGS -1.00"), skip it — do not list it as a separate item.
- Strip store PLU codes, item numbers, and UPC digits from item names. Return only the human-readable product name.
- If the receipt is multi-column, read left column first, then right column for the same row.
- If an item quantity is blank or unclear, default to 1.
- If a price is negative (refund/coupon), omit that line.

For each item, set "item_category" to one of:
- "food" — groceries, produce, meat, dairy, snacks, beverages, frozen food, canned goods, bread, condiments, spices
- "household" — cleaning supplies, paper towels, toilet paper, laundry detergent, dish soap, trash bags, batteries
- "personal_care" — shampoo, soap, toothpaste, deodorant, vitamins, medicine, skincare
- "non_grocery" — toys, clothing, electronics, tools, sporting goods, furniture, gift cards, alcohol (if separate), or anything NOT a consumable grocery/household/personal care product

total_amount: use the final "Grand Total" or "Amount Due" line — NOT the subtotal and NOT a pre-discount total.

Be precise with prices. Include every purchasable line item on the receipt.`;

/**
 * Parse a receipt image using OpenAI GPT-4o Vision.
 *
 * @param base64   Raw base64 image data (no data: URI prefix).
 * @param mimeType MIME type of the image (default: image/jpeg).
 */
export async function extractReceiptItems(
  base64: string,
  mimeType: string = 'image/jpeg'
): Promise<ReceiptScanResult | null> {
  if (!hasOpenAiKey()) {
    console.warn('[AI] Receipt scan endpoint is not configured.');
    return null;
  }

  if (!base64 || base64.length === 0) {
    throw new Error('Image appears to be empty. Please try a different photo.');
  }

  const body = { prompt: PROMPT, image: base64, mimeType };

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  let res: Response | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      res = await fetch(config.receiptScanUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      if (attempt === 2) throw new Error('Network error. Check your connection and try again.');
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }
    if (res.status !== 429 && res.status !== 503) break;
    if (attempt < 2) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '4', 10);
      await new Promise(r => setTimeout(r, Math.min(retryAfter * 1000, 8000)));
    }
  }

  if (!res!.ok) {
    const errorText = await res!.text();
    console.error('[AI] OpenAI API Error:', res!.status, errorText);
    if (res!.status === 401) throw new Error('Receipt scan is not configured. Please contact support.');
    if (res!.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
    if (res!.status === 400) throw new Error('The image could not be processed. Try a clearer, well-lit photo.');
    throw new Error(`Receipt scan failed (${res!.status}). Please try again.`);
  }

  const data = await res!.json();
  const text = typeof data === 'string' ? data : JSON.stringify(data);

  if (!text) {
    console.error('[AI] No receipt scan result returned');
    throw new Error('No response from AI. Please try again with a clearer photo.');
  }

  const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsed: ReceiptScanResult;
  try {
    parsed = JSON.parse(cleanText) as ReceiptScanResult;
  } catch {
    console.error('[AI] Failed to parse OpenAI JSON:', cleanText);
    throw new Error('Could not read the receipt data. Please try a clearer photo.');
  }

  parsed.total = parsed.total_amount;
  if (parsed.items) {
    parsed.items = parsed.items.map(item => ({
      ...item,
      price: item.unit_price ?? item.total_price ?? undefined,
      unit: 'unit',
    }));
  }

  return parsed;
}
