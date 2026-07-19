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
- Expand abbreviations into full, real words where the product is identifiable (e.g. "ORG BANANA" → "Organic Banana", "WHIP CRM" → "Whipped Cream") — do not invent details, just decode the abbreviation into the closest plain-English product name.
- Return item names in Title Case (e.g. "Whole Milk", not "WHOLE MILK" or "whole milk") — even though the receipt prints in all caps. This lets the app tell a real product name apart from raw unreadable receipt text.
- If the printed text is genuinely too fragmentary or ambiguous to name a real product (e.g. a bare SKU-like code), leave it as-is rather than guessing — do not fabricate a plausible-sounding product name for text you cannot confidently read.
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
    if (__DEV__) console.warn('[AI] Receipt scan endpoint is not configured.');
    return null;
  }

  if (!base64 || base64.length === 0) {
    throw new Error('Image appears to be empty. Please try a different photo.');
  }

  const body = { prompt: PROMPT, image: base64, mimeType };

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  // Use XMLHttpRequest (React Native's native XHR networking) rather than the
  // global fetch. On Expo SDK 56 the global fetch is expo/fetch (winter
  // runtime), whose native module segfaults — EXC_BAD_ACCESS on
  // expo.modules.fetch.RequestQueue during JavaScriptPromise.reject — when a
  // large-body request (the multi-MB base64 receipt image) rejects. That native
  // crash kills the app before any JS catch runs. XHR is unaffected.
  type XhrResult = { status: number; text: string; retryAfter: number | null };
  const postReceipt = (): Promise<XhrResult> =>
    new Promise<XhrResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', config.receiptScanUrl);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 45000;
      xhr.onload = () => {
        const ra = xhr.getResponseHeader('retry-after');
        resolve({ status: xhr.status, text: xhr.responseText ?? '', retryAfter: ra ? parseInt(ra, 10) : null });
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.ontimeout = () => reject(new Error('timeout'));
      xhr.send(JSON.stringify(body));
    });

  let result: XhrResult | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      result = await postReceipt();
    } catch {
      if (attempt === 2) throw new Error('Network error. Check your connection and try again.');
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (result.status !== 429 && result.status !== 503) break;
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, Math.min((result!.retryAfter ?? 4) * 1000, 8000)));
    }
  }

  if (!result || result.status < 200 || result.status >= 300) {
    const status = result?.status ?? 0;
    if (__DEV__) console.error('[AI] Receipt scan API error:', status, result?.text);
    if (status === 401) throw new Error('Receipt scan is not configured. Please contact support.');
    if (status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
    if (status === 400) throw new Error('The image could not be processed. Try a clearer, well-lit photo.');
    throw new Error(`Receipt scan failed (${status}). Please try again.`);
  }

  let data: unknown;
  try {
    data = JSON.parse(result.text);
  } catch {
    data = result.text;
  }
  const text = typeof data === 'string' ? data : JSON.stringify(data);

  if (!text) {
    if (__DEV__) console.error('[AI] No receipt scan result returned');
    throw new Error('No response from AI. Please try again with a clearer photo.');
  }

  const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsed: ReceiptScanResult;
  try {
    parsed = JSON.parse(cleanText) as ReceiptScanResult;
  } catch {
    if (__DEV__) console.error('[AI] Failed to parse OpenAI JSON:', cleanText);
    throw new Error('Could not read the receipt data. Please try a clearer photo.');
  }

  // The model returns untrusted JSON: names can be null/numeric/missing and
  // prices can arrive as strings. Sanitize every field here — the boundary
  // where model output enters the app — so a malformed Walmart row can't crash
  // the review sheet (item.name.trim / total_amount.toFixed / price.toFixed).
  const toNum = (v: unknown): number | null => {
    const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.\-]/g, '')) : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  parsed.store_name = typeof parsed.store_name === 'string' ? parsed.store_name : null;
  parsed.transaction_date = typeof parsed.transaction_date === 'string' ? parsed.transaction_date : null;
  parsed.total_amount = toNum(parsed.total_amount);
  parsed.total = parsed.total_amount;

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  parsed.items = rawItems
    .map((item): ScannedItem => {
      const name = String((item as { name?: unknown })?.name ?? '').trim();
      const q = toNum(item?.quantity);
      const unit_price = toNum(item?.unit_price);
      const total_price = toNum(item?.total_price);
      const category = (item as { item_category?: unknown })?.item_category;
      const item_category: ItemCategory =
        category === 'household' || category === 'personal_care' || category === 'non_grocery'
          ? category
          : 'food';
      return {
        name,
        quantity: q != null && q > 0 ? q : 1,
        unit_price,
        total_price,
        item_category,
        price: unit_price ?? total_price ?? undefined,
        unit: 'unit',
      };
    })
    .filter((item) => item.name.length > 0);

  return parsed;
}
