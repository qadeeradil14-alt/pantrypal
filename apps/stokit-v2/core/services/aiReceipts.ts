import { config, hasOpenAiKey } from '../../lib/config';

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

const PROMPT = `Analyze this receipt image and extract the data as JSON. Return ONLY pure, valid JSON (no markdown, no \`\`\`json blocks) with this exact structure:
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

For each item, set "item_category" to one of:
- "food" — groceries, produce, meat, dairy, snacks, beverages, frozen food, canned goods, bread, condiments
- "household" — cleaning supplies, paper towels, toilet paper, laundry detergent, dish soap, trash bags
- "personal_care" — shampoo, soap, toothpaste, deodorant, vitamins, medicine
- "non_grocery" — toys, clothing, electronics, tools, sporting goods, furniture, or anything NOT food/household/personal

Be precise with prices. Include every line item on the receipt.`;

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
    console.warn('[AI] OpenAI API key is not configured.');
    return null;
  }

  if (!base64 || base64.length === 0) {
    throw new Error('Image appears to be empty. Please try a different photo.');
  }

  const body = {
    model: 'gpt-4o',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openAiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[AI] OpenAI API Error:', res.status, errorText);
    if (res.status === 401) throw new Error('OpenAI API key is invalid. Please contact support.');
    if (res.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
    if (res.status === 400) throw new Error('The image could not be processed. Try a clearer, well-lit photo.');
    throw new Error(`Receipt scan failed (${res.status}). Please try again.`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    console.error('[AI] No text returned from OpenAI:', JSON.stringify(data));
    throw new Error('No response from AI. Please try again with a clearer photo.');
  }

  const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

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
      price: item.total_price ?? item.unit_price ?? undefined,
      unit: 'unit',
    }));
  }

  return parsed;
}
