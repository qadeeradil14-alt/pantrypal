/**
 * usStates.ts — US state name / abbreviation utilities.
 *
 * Kept in its own module so both lib/stores.ts and lib/storeSearch.ts can
 * import it without creating a circular dependency (stores imports storeSearch,
 * so storeSearch must not import stores).
 */

/**
 * Canonical map of every US state, DC, and inhabited territory.
 * Keys are lowercase full names; values are the canonical 2-letter USPS code.
 */
export const US_STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'district of columbia': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY',
  'puerto rico': 'PR', 'guam': 'GU',
  'u.s. virgin islands': 'VI', 'virgin islands': 'VI',
  'american samoa': 'AS',
  'northern mariana islands': 'MP',
};

/** Set of all canonical 2-letter USPS codes (fast membership check). */
export const US_STATE_CODES = new Set(Object.values(US_STATE_NAME_TO_CODE));

/**
 * Normalize any US state input — full name OR 2-letter abbreviation, any case —
 * to its canonical uppercase 2-letter USPS code.
 *
 *   "VA"       → "VA"
 *   "Virginia" → "VA"
 *   "virginia" → "VA"
 *   "Va"       → "VA"
 *   "CA"       → "CA"
 *   "California" → "CA"
 *   "District of Columbia" → "DC"
 *
 * Returns null when the input doesn't map to a known US state / territory.
 *
 * Use this for ALL state comparisons — never compare raw strings like
 * "VA" !== "Virginia".
 */
export function normalizeUSState(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already a 2-letter code?
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && US_STATE_CODES.has(upper)) return upper;

  // Full name — collapse internal whitespace, strip trailing periods
  const key = trimmed.toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
  return US_STATE_NAME_TO_CODE[key] ?? null;
}
