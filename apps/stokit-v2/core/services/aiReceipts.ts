import * as FileSystem from 'expo-file-system';
import { config, hasGeminiKey } from '../../lib/config';

export interface ScannedItem {
  name: string;
  quantity: number;
  unit?: string;
  price?: number;
}

export interface ReceiptScanResult {
  total: number | null;
  items: ScannedItem[];
}

export async function extractReceiptItems(imageUri: string): Promise<ReceiptScanResult | null> {
  if (!hasGeminiKey()) {
    console.warn('Gemini API key is not configured.');
    return null;
  }

  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (err) {
    console.error('Failed to read image file', err);
    return null;
  }

  const prompt = `You are a receipt parsing assistant for a grocery/pantry app.
Analyze the attached receipt image and extract two things:
1. The overall receipt total amount.
2. The list of items purchased.

Return ONLY pure, valid JSON (no markdown wrapping, no \`\`\`json blocks) in exactly this format:
{
  "total": 123.45,
  "items": [
    { "name": "Milk", "quantity": 1, "unit": "gal", "price": 4.99 },
    { "name": "Apples", "quantity": 3, "unit": "lbs", "price": 5.00 }
  ]
}

- If you cannot find the total, output null for total.
- Name should be clean and readable (e.g. "Milk" instead of "ORG WHL MILK").
- Extract the exact quantity. If not specified, default to 1.
- Unit is optional (e.g. "oz", "lbs", "gal"). Do not include if unknown.
- Price is the total price for that line item.`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: 'application/json',
    },
  };

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Gemini API Error:', errorText);
      return null;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      console.error('No text returned from Gemini');
      return null;
    }

    // Try to parse the JSON
    const parsed = JSON.parse(text) as ReceiptScanResult;
    return parsed;
  } catch (err) {
    console.error('Failed to parse receipt with Gemini', err);
    return null;
  }
}
