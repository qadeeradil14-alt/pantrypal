/**
 * Runtime configuration — read from EXPO_PUBLIC_* environment variables.
 *
 * FREE tier (works today, no credit card):
 *   EXPO_PUBLIC_OCR_SPACE_KEY  — ocr.space free account (25k scans/month)
 *                                 Sign up: https://ocr.space/ocrapi
 *
 * PREMIUM upgrade (add before App Store release):
 *   EXPO_PUBLIC_GOOGLE_API_KEY — Google Cloud API key with:
 *                                 • Places API  (store discovery)
 *                                 • Cloud Vision API (receipt OCR)
 *                                When set, both services upgrade automatically.
 *
 * Create a .env file at the project root (see .env.example).
 */

export const config = {
  googleApiKey:   process.env.EXPO_PUBLIC_GOOGLE_API_KEY   ?? '',
  geoapifyApiKey: process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? '',
  ocrSpaceKey:    process.env.EXPO_PUBLIC_OCR_SPACE_KEY    ?? '',
  receiptScanUrl: process.env.EXPO_PUBLIC_RECEIPT_SCAN_URL ?? '',
} as const;

/** True if the Google premium upgrade is configured. */
export const hasGoogleKey   = () => Boolean(config.googleApiKey);

/** True if the Geoapify free upgrade is configured. */
export const hasGeoapifyKey = () => Boolean(config.geoapifyApiKey);

/** True if the free ocr.space key is configured. */
export const hasOcrSpaceKey = () => Boolean(config.ocrSpaceKey);

/** True if Gemini API key is configured. */
export const hasOpenAiKey = () => Boolean(config.receiptScanUrl);

/** True if any OCR provider is available. */
export const hasOcr = () => hasGoogleKey() || hasOcrSpaceKey();
