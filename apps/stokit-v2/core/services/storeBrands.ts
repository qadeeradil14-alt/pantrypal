/**
 * Stokit v2 — Controlled Brand Registry
 *
 * Logo resolution order (StoreChip enforces this at render time):
 *   1. Verified remote URL  — hand-curated per brand, deterministic.
 *   2. Logo.dev URL         — auto, domain-based, good for smaller chains.
 *   3. Branded letter chip  — instant fallback on any image failure.
 *
 * Verified URLs use Wikimedia Commons Special:FilePath redirects —
 * canonical SVG→PNG conversions maintained by the Wikimedia community.
 * The redirect URL never changes even when the underlying file is updated.
 *
 * OTA-eligible: no bundled assets, no native code.
 */

export interface StoreBrand {
  color: string;
  abbr: string;
  /**
   * Primary logo URL — verified and curated for this brand.
   * StoreChip tries this first, falls back to letter chip on error.
   */
  logoUrl?: string;
}

// ── URL builders ─────────────────────────────────────────────────────────────

/**
 * Wikimedia Commons Special:Redirect/file — returns a raster PNG thumbnail
 * (not the raw SVG), which React Native's Image component can render.
 * The redirect is stable and version-agnostic.
 */
function wm(filename: string, width = 200): string {
  return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(filename)}&width=${width}`;
}

/** Google Favicon API — Guaranteed raster PNG, zero rate limits, no SVGs to crash RN */
function ld(domain: string): string {
  return `https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=128`;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const BRANDS: Record<string, StoreBrand> = {
  // ── Tier 1: Wikimedia-verified (curl-confirmed → raster PNG) ────────────
  aldi:             { color: '#00005B', abbr: 'A',   logoUrl: wm('Aldi_Süd_2017_logo.svg') },
  walmart:          { color: '#0071CE', abbr: 'W',   logoUrl: wm('Walmart_Spark.svg') },
  target:           { color: '#CC0000', abbr: 'T',   logoUrl: wm('Target_Corporation_logo_(vector).svg') },
  lidl:             { color: '#0050AA', abbr: 'L',   logoUrl: wm('Lidl-Logo.svg') },
  giant:            { color: '#CC0000', abbr: 'G',   logoUrl: wm('Giant_Food_logo.svg') },
  safeway:          { color: '#CC0000', abbr: 'SW',  logoUrl: wm('Safeway_logo.svg') },
  kroger:           { color: '#00539B', abbr: 'K',   logoUrl: wm('Kroger_logo.svg') },

  // ── Tier 2: Logo.dev — confirmed working or best available ───────────────
  'whole foods':    { color: '#00674B', abbr: 'WF',  logoUrl: ld('wholefoodsmarket.com') },
  wholefoods:       { color: '#00674B', abbr: 'WF',  logoUrl: ld('wholefoodsmarket.com') },
  "trader joe's":   { color: '#BB1F3C', abbr: 'TJ',  logoUrl: ld('traderjoes.com') },
  'trader joes':    { color: '#BB1F3C', abbr: 'TJ',  logoUrl: ld('traderjoes.com') },
  costco:           { color: '#E31837', abbr: 'C',   logoUrl: ld('costco.com') },
  publix:           { color: '#1A7F3C', abbr: 'P',   logoUrl: ld('publix.com') },
  wegmans:          { color: '#D4001A', abbr: 'WM',  logoUrl: ld('wegmans.com') },
  "sam's club":     { color: '#0067C8', abbr: 'SC',  logoUrl: ld('samsclub.com') },
  sams:             { color: '#0067C8', abbr: 'SC',  logoUrl: ld('samsclub.com') },
  sprouts:          { color: '#5E9B2F', abbr: 'SP',  logoUrl: ld('sprouts.com') },
  heb:              { color: '#E31837', abbr: 'HEB', logoUrl: ld('heb.com') },
  'harris teeter':  { color: '#D4001A', abbr: 'HT',  logoUrl: ld('harristeeter.com') },
  'food lion':      { color: '#6EBA2D', abbr: 'FL',  logoUrl: ld('foodlion.com') },
  meijer:           { color: '#CC0000', abbr: 'M',   logoUrl: ld('meijer.com') },
  instacart:        { color: '#43B02A', abbr: 'IC',  logoUrl: ld('instacart.com') },
  cvs:              { color: '#CC0000', abbr: 'CVS', logoUrl: ld('cvs.com') },
  walgreens:        { color: '#E31837', abbr: 'WG',  logoUrl: ld('walgreens.com') },
  amazon:           { color: '#FF9900', abbr: 'A',   logoUrl: ld('amazon.com') },
  'fresh market':   { color: '#2E7D32', abbr: 'FM',  logoUrl: ld('thefreshmarket.com') },
  stop:             { color: '#CC0000', abbr: 'S&S', logoUrl: ld('stopandshop.com') },
};

/** Progress-bar colors for route stops (up to 6). */
export const ROUTE_COLORS = [
  '#6FB585', // green
  '#E8913E', // orange
  '#7FA8C9', // blue
  '#D26464', // red
  '#D8A24A', // gold
  '#9B7EC8', // purple
];

/**
 * Returns brand color and abbreviation for a store name.
 * Falls back to the store's saved logoColor or a default.
 */
export function getStoreBrand(
  name: string,
  fallbackColor?: string,
): StoreBrand {
  const key = name.toLowerCase().trim();
  for (const [k, brand] of Object.entries(BRANDS)) {
    if (key.includes(k)) return brand;
  }
  
  // Abbreviate the name ourselves
  const words = name.trim().split(/\s+/);
  const abbr =
    words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
      
  return { 
    color: fallbackColor ?? '#A4917A', 
    abbr,
  };
}
