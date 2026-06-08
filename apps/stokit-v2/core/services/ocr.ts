/**
 * Receipt OCR service.
 *
 * PRIMARY (free, just needs a free key): ocr.space
 *   — 25,000 scans/month free, no credit card.
 *   — Sign up at https://ocr.space/ocrapi (30 seconds).
 *   — Set EXPO_PUBLIC_OCR_SPACE_KEY in your .env file.
 *
 * UPGRADE (when Google key is set): Google Cloud Vision API
 *   — Set EXPO_PUBLIC_GOOGLE_API_KEY to activate automatically.
 *   — Better accuracy on complex receipts.
 *
 * App Store path: add EXPO_PUBLIC_GOOGLE_API_KEY to EAS secrets →
 * OCR upgrades to Google Vision automatically, zero code changes.
 *
 * Fallback (no keys): graceful no-op — the amount field stays empty
 * and the user types the total manually.
 */

import * as FileSystem from 'expo-file-system';
import { config, hasGoogleKey, hasOcrSpaceKey } from '../../lib/config';

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Extract the receipt total from a local image URI.
 * Returns the amount in dollars, or null if extraction fails.
 */
export async function extractReceiptTotal(imageUri: string): Promise<number | null> {
  if (hasGoogleKey())     return extractWithGoogleVision(imageUri);
  if (hasOcrSpaceKey())   return extractWithOCRSpace(imageUri);
  return null; // No keys — user types manually
}

/** True if at least one OCR provider is configured. */
export function hasOcrCapability(): boolean {
  return hasGoogleKey() || hasOcrSpaceKey();
}

// ─── Total parser (shared by both providers) ──────────────────────────────────

/**
 * Parse a dollar total from raw OCR text.
 * Strategy: look for total-keyword lines → largest dollar amount fallback.
 */
export function parseTotal(text: string): number | null {
  if (!text) return null;

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const AMOUNT_RE = /\$?\s*([\d,]+\.?\d*)/g;

  const TOTAL_KEYWORDS = [
    ['grand total', 'amount due', 'amount owed', 'balance due', 'total due', 'total amount'],
    ['total'],
    ['subtotal', 'sub total', 'sub-total'],
    ['amount', 'charge', 'due'],
  ];

  for (const keywords of TOTAL_KEYWORDS) {
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        const amounts = extractAmounts(line, AMOUNT_RE);
        if (amounts.length) return amounts[amounts.length - 1];
      }
    }
  }

  // Fallback: largest dollar amount on the receipt
  const all: number[] = [];
  for (const line of lines) all.push(...extractAmounts(line, AMOUNT_RE));
  return all.length ? Math.max(...all) : null;
}

function extractAmounts(line: string, re: RegExp): number[] {
  const amounts: number[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(n) && n > 0 && n < 10_000) amounts.push(n);
  }
  return amounts;
}

// ─── ocr.space (FREE, 25k/month) ─────────────────────────────────────────────

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';

async function extractWithOCRSpace(imageUri: string): Promise<number | null> {
  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return null;
  }

  // ocr.space accepts base64 with a data-URI prefix
  const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const base64DataUri = `data:${mimeType};base64,${base64}`;

  const formData = new FormData();
  formData.append('apikey', config.ocrSpaceKey);
  formData.append('base64Image', base64DataUri);
  formData.append('language', 'eng');
  formData.append('isOverlayRequired', 'false');
  formData.append('detectOrientation', 'true');
  formData.append('scale', 'true');
  formData.append('OCREngine', '2'); // Engine 2 is better for receipts

  try {
    const res = await fetch(OCR_SPACE_URL, { method: 'POST', body: formData });
    if (!res.ok) return null;
    const data = (await res.json()) as OcrSpaceResponse;
    const text = data.ParsedResults?.[0]?.ParsedText ?? '';
    return parseTotal(text);
  } catch {
    return null;
  }
}

// ─── Google Cloud Vision (premium upgrade) ────────────────────────────────────

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';

async function extractWithGoogleVision(imageUri: string): Promise<number | null> {
  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return null;
  }

  const body = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
    }],
  };

  try {
    const res = await fetch(`${VISION_URL}?key=${config.googleApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GoogleVisionResponse;
    const text = data.responses?.[0]?.fullTextAnnotation?.text ?? '';
    return parseTotal(text);
  } catch {
    return null;
  }
}

// ─── Response types ───────────────────────────────────────────────────────────

interface OcrSpaceResponse {
  ParsedResults?: Array<{ ParsedText?: string }>;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string;
}

interface GoogleVisionResponse {
  responses?: Array<{ fullTextAnnotation?: { text?: string } }>;
}
