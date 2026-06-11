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
  console.log('[OCR] Extracting from URI:', imageUri);
  try {
    const info = await FileSystem.getInfoAsync(imageUri);
    console.log('[OCR] Image file info:', info);
  } catch (e) {
    console.log('[OCR] Error getting file info:', e);
  }

  if (hasGoogleKey())     return extractWithGoogleVision(imageUri);
  if (hasOcrSpaceKey())   return extractWithOCRSpace(imageUri);
  
  console.log('[OCR] No API keys available');
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
  if (!text) {
    console.log('[OCR] parseTotal: text is empty');
    return null;
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const TOTAL_KEYWORDS = [
    ['grand total', 'amount due', 'amount owed', 'balance due', 'total due', 'total amount'],
    ['total'],
    ['subtotal', 'sub total', 'sub-total'],
    ['amount', 'charge', 'due'],
  ];

  for (const keywords of TOTAL_KEYWORDS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        let amounts = extractAmounts(line);
        // If no amount on this line, check the next line (OCR often splits them)
        if (amounts.length === 0 && i + 1 < lines.length) {
          amounts = extractAmounts(lines[i + 1]);
        }
        if (amounts.length) {
          const matched = amounts[amounts.length - 1];
          console.log('[OCR] parseTotal: Found by keyword', keywords[0], '->', matched);
          return matched;
        }
      }
    }
  }

  // Fallback: largest dollar amount on the receipt
  const all: number[] = [];
  for (const line of lines) all.push(...extractAmounts(line));
  if (all.length) {
    const matched = Math.max(...all);
    console.log('[OCR] parseTotal: Found by fallback max value ->', matched);
    return matched;
  }
  
  console.log('[OCR] parseTotal: No amounts found in text');
  return null;
}

function extractAmounts(line: string): number[] {
  // Strictly match currency format with 2 decimal places to avoid store numbers/zip codes
  // Matches: 12.34, $12.34, 1,234.56, 12,34 (european comma)
  const AMOUNT_RE = /\$?\s*([\d,]+[.,]\d{2})(?!\d)/g;
  const amounts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(line)) !== null) {
    let valStr = m[1];
    // Handle European comma decimals (e.g. 12,34 -> 12.34)
    if (valStr.match(/,\d{2}$/)) {
      valStr = valStr.replace(/,(\d{2})$/, '.$1');
    }
    // Remove thousand separators
    valStr = valStr.replace(/,/g, '');
    const n = parseFloat(valStr);
    // Ignore absurd amounts > $5000 to filter out potential misreads
    if (!isNaN(n) && n > 0 && n < 5000) amounts.push(n);
  }
  return amounts;
}

// ─── ocr.space (FREE, 25k/month) ─────────────────────────────────────────────

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';

async function extractWithOCRSpace(imageUri: string): Promise<number | null> {
  const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  const formData = new FormData();
  formData.append('apikey', config.ocrSpaceKey);
  
  // Use proper file object for React Native FormData instead of base64 to avoid memory crashes
  formData.append('file', {
    uri: imageUri,
    type: mimeType,
    name: `receipt.${ext}`,
  } as any);
  
  formData.append('language', 'eng');
  formData.append('isOverlayRequired', 'false');
  formData.append('detectOrientation', 'true');
  formData.append('scale', 'true');
  formData.append('OCREngine', '2'); // Engine 2 is better for receipts

  console.log('[OCR] Uploading to OCR.space...');
  try {
    const res = await fetch(OCR_SPACE_URL, { method: 'POST', body: formData });
    if (!res.ok) {
      console.log('[OCR] Upload failed with status:', res.status, res.statusText);
      return null;
    }
    const data = (await res.json()) as OcrSpaceResponse;
    console.log('[OCR] OCR Space raw response snippet:', JSON.stringify(data).substring(0, 300));
    
    if (data.IsErroredOnProcessing) {
      console.log('[OCR] Parser error reason:', data.ErrorMessage);
      return null;
    }
    
    const text = data.ParsedResults?.[0]?.ParsedText ?? '';
    const total = parseTotal(text);
    console.log('[OCR] Final parsed total:', total);
    return total;
  } catch (err) {
    console.log('[OCR] Upload/Network error:', err);
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
  } catch (err) {
    console.log('[OCR] File read error (Google Vision):', err);
    return null;
  }

  const body = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
    }],
  };

  console.log('[OCR] Uploading to Google Vision...');
  try {
    const res = await fetch(`${VISION_URL}?key=${config.googleApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.log('[OCR] Google Vision Upload failed:', res.status, res.statusText);
      return null;
    }
    const data = (await res.json()) as GoogleVisionResponse;
    console.log('[OCR] Google Vision raw response snippet:', JSON.stringify(data).substring(0, 300));
    
    const text = data.responses?.[0]?.fullTextAnnotation?.text ?? '';
    const total = parseTotal(text);
    console.log('[OCR] Final parsed total (Google):', total);
    return total;
  } catch (err) {
    console.log('[OCR] Google Vision Upload/Network error:', err);
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
