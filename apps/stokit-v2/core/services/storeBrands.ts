/**
 * Stokit v2 — Store Brand Registry
 *
 * Logo resolution order (StoreChip enforces this at render time):
 *   1. Registry entry      — known chain, Google Favicon at sz=128.
 *   2. Letter chip         — safe fallback for unknown stores.
 *
 * Google Favicon API (s2.googleusercontent.com) confirmed working:
 *   - Returns 200 for real domains (favicons are the brand logo for most chains)
 *   - Returns 404 for non-existent domains → onError fires → letter chip
 *   - No API key, no rate limits, no hotlinking restrictions
 *
 * OTA-eligible: no bundled assets, no native code.
 */

export interface StoreBrand {
  color: string;
  abbr: string;
  logoUrl?: string;
}

// ── URL builder ───────────────────────────────────────────────────────────────

/** Google Favicon API — real PNG, 404s for non-existent domains, no token. */
function gf(domain: string): string {
  return `https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=128`;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const BRANDS: Record<string, StoreBrand> = {
  // ── Grocery / Supermarkets ────────────────────────────────────────────────
  'whole foods':        { color: '#00674B', abbr: 'WF',  logoUrl: gf('wholefoodsmarket.com') },
  wholefoods:           { color: '#00674B', abbr: 'WF',  logoUrl: gf('wholefoodsmarket.com') },
  "trader joe's":       { color: '#BB1F3C', abbr: 'TJ',  logoUrl: gf('traderjoes.com') },
  'trader joes':        { color: '#BB1F3C', abbr: 'TJ',  logoUrl: gf('traderjoes.com') },
  walmart:              { color: '#0071CE', abbr: 'W',   logoUrl: gf('walmart.com') },
  target:               { color: '#CC0000', abbr: 'T',   logoUrl: gf('target.com') },
  kroger:               { color: '#00539B', abbr: 'K',   logoUrl: gf('kroger.com') },
  publix:               { color: '#1A7F3C', abbr: 'P',   logoUrl: gf('publix.com') },
  aldi:                 { color: '#00005B', abbr: 'A',   logoUrl: gf('aldi.us') },
  lidl:                 { color: '#0050AA', abbr: 'L',   logoUrl: gf('lidl.com') },
  giant:                { color: '#CC0000', abbr: 'G',   logoUrl: gf('giantfood.com') },
  safeway:              { color: '#CC0000', abbr: 'SW',  logoUrl: gf('safeway.com') },
  wegmans:              { color: '#D4001A', abbr: 'WM',  logoUrl: gf('wegmans.com') },
  sprouts:              { color: '#5E9B2F', abbr: 'SP',  logoUrl: gf('sprouts.com') },
  heb:                  { color: '#E31837', abbr: 'HEB', logoUrl: gf('heb.com') },
  'h-e-b':              { color: '#E31837', abbr: 'HEB', logoUrl: gf('heb.com') },
  'harris teeter':      { color: '#D4001A', abbr: 'HT',  logoUrl: gf('harristeeter.com') },
  'food lion':          { color: '#6EBA2D', abbr: 'FL',  logoUrl: gf('foodlion.com') },
  meijer:               { color: '#CC0000', abbr: 'M',   logoUrl: gf('meijer.com') },
  'stop & shop':        { color: '#CC0000', abbr: 'S&S', logoUrl: gf('stopandshop.com') },
  'stop and shop':      { color: '#CC0000', abbr: 'S&S', logoUrl: gf('stopandshop.com') },
  shoprite:             { color: '#E31837', abbr: 'SR',  logoUrl: gf('shoprite.com') },
  'shop rite':          { color: '#E31837', abbr: 'SR',  logoUrl: gf('shoprite.com') },
  'fresh market':       { color: '#2E7D32', abbr: 'FM',  logoUrl: gf('thefreshmarket.com') },
  vons:                 { color: '#E31837', abbr: 'V',   logoUrl: gf('vons.com') },
  "mom's":              { color: '#4A7C3F', abbr: 'MO',  logoUrl: gf('momsorganicmarket.com') },
  "mom's organic":      { color: '#4A7C3F', abbr: 'MO',  logoUrl: gf('momsorganicmarket.com') },
  'moms organic':       { color: '#4A7C3F', abbr: 'MO',  logoUrl: gf('momsorganicmarket.com') },
  winco:                { color: '#003F8C', abbr: 'WC',  logoUrl: gf('wincofoods.com') },
  'winn-dixie':         { color: '#CC0000', abbr: 'WD',  logoUrl: gf('winndixie.com') },
  'winn dixie':         { color: '#CC0000', abbr: 'WD',  logoUrl: gf('winndixie.com') },
  'giant eagle':        { color: '#E31837', abbr: 'GE',  logoUrl: gf('gianteagle.com') },
  acme:                 { color: '#E31837', abbr: 'AC',  logoUrl: gf('acmemarkets.com') },
  ralphs:               { color: '#005BAC', abbr: 'R',   logoUrl: gf('ralphs.com') },
  "fry's":              { color: '#E31837', abbr: 'F',   logoUrl: gf('frysfood.com') },
  frys:                 { color: '#E31837', abbr: 'F',   logoUrl: gf('frysfood.com') },
  'price chopper':      { color: '#E31837', abbr: 'PC',  logoUrl: gf('pricechopper.com') },
  'market basket':      { color: '#003DA5', abbr: 'MB',  logoUrl: gf('marketbasket.com') },
  'hy-vee':             { color: '#E31837', abbr: 'HV',  logoUrl: gf('hy-vee.com') },
  hyvee:                { color: '#E31837', abbr: 'HV',  logoUrl: gf('hy-vee.com') },
  'stater bros':        { color: '#E31837', abbr: 'SB',  logoUrl: gf('staterbros.com') },
  'food4less':          { color: '#E31837', abbr: 'F4',  logoUrl: gf('food4less.com') },
  'food 4 less':        { color: '#E31837', abbr: 'F4',  logoUrl: gf('food4less.com') },
  fiesta:               { color: '#E31837', abbr: 'FM',  logoUrl: gf('fiestamart.com') },

  // ── Wholesale / Club ──────────────────────────────────────────────────────
  costco:               { color: '#E31837', abbr: 'C',   logoUrl: gf('costco.com') },
  "sam's club":         { color: '#0067C8', abbr: 'SC',  logoUrl: gf('samsclub.com') },
  sams:                 { color: '#0067C8', abbr: 'SC',  logoUrl: gf('samsclub.com') },
  bjs:                  { color: '#003DA5', abbr: 'BJ',  logoUrl: gf('bjs.com') },
  "bj's":               { color: '#003DA5', abbr: 'BJ',  logoUrl: gf('bjs.com') },

  // ── Pharmacy / Drug ───────────────────────────────────────────────────────
  cvs:                  { color: '#CC0000', abbr: 'CVS', logoUrl: gf('cvs.com') },
  walgreens:            { color: '#E31837', abbr: 'WG',  logoUrl: gf('walgreens.com') },
  'rite aid':           { color: '#003DA5', abbr: 'RA',  logoUrl: gf('riteaid.com') },
  riteaid:              { color: '#003DA5', abbr: 'RA',  logoUrl: gf('riteaid.com') },

  // ── Convenience ───────────────────────────────────────────────────────────
  '7-eleven':           { color: '#E31837', abbr: '7E',  logoUrl: gf('7-eleven.com') },
  '7 eleven':           { color: '#E31837', abbr: '7E',  logoUrl: gf('7-eleven.com') },
  wawa:                 { color: '#CC0000', abbr: 'WW',  logoUrl: gf('wawa.com') },
  sheetz:               { color: '#CC0000', abbr: 'SH',  logoUrl: gf('sheetz.com') },
  'circle k':           { color: '#CC0000', abbr: 'CK',  logoUrl: gf('circlek.com') },

  // ── Fast Food / QSR ──────────────────────────────────────────────────────
  "mcdonald's":         { color: '#FFC72C', abbr: 'MC',  logoUrl: gf('mcdonalds.com') },
  mcdonalds:            { color: '#FFC72C', abbr: 'MC',  logoUrl: gf('mcdonalds.com') },
  starbucks:            { color: '#00704A', abbr: 'SB',  logoUrl: gf('starbucks.com') },
  ihop:                 { color: '#003DA5', abbr: 'IH',  logoUrl: gf('ihop.com') },
  'burger king':        { color: '#FF8200', abbr: 'BK',  logoUrl: gf('burgerking.com') },
  'chick-fil-a':        { color: '#DD0031', abbr: 'CFA', logoUrl: gf('chick-fil-a.com') },
  'chick fil a':        { color: '#DD0031', abbr: 'CFA', logoUrl: gf('chick-fil-a.com') },
  chickfila:            { color: '#DD0031', abbr: 'CFA', logoUrl: gf('chick-fil-a.com') },
  subway:               { color: '#009900', abbr: 'SUB', logoUrl: gf('subway.com') },
  'taco bell':          { color: '#702082', abbr: 'TB',  logoUrl: gf('tacobell.com') },
  tacobell:             { color: '#702082', abbr: 'TB',  logoUrl: gf('tacobell.com') },
  chipotle:             { color: '#A81612', abbr: 'CH',  logoUrl: gf('chipotle.com') },
  panera:               { color: '#7C4D31', abbr: 'PB',  logoUrl: gf('panerabread.com') },
  "wendy's":            { color: '#E2203C', abbr: 'W',   logoUrl: gf('wendys.com') },
  wendys:               { color: '#E2203C', abbr: 'W',   logoUrl: gf('wendys.com') },
  'pizza hut':          { color: '#EE3124', abbr: 'PH',  logoUrl: gf('pizzahut.com') },
  "domino's":           { color: '#006491', abbr: 'D',   logoUrl: gf('dominos.com') },
  dominos:              { color: '#006491', abbr: 'D',   logoUrl: gf('dominos.com') },
  "papa john's":        { color: '#006633', abbr: 'PJ',  logoUrl: gf('papajohns.com') },
  'papa johns':         { color: '#006633', abbr: 'PJ',  logoUrl: gf('papajohns.com') },
  'little caesars':     { color: '#FF6600', abbr: 'LC',  logoUrl: gf('littlecaesars.com') },
  kfc:                  { color: '#F40027', abbr: 'KFC', logoUrl: gf('kfc.com') },
  popeyes:              { color: '#FF8200', abbr: 'POP', logoUrl: gf('popeyes.com') },
  "popeye's":           { color: '#FF8200', abbr: 'POP', logoUrl: gf('popeyes.com') },
  'shake shack':        { color: '#7EB740', abbr: 'SS',  logoUrl: gf('shakeshack.com') },
  'five guys':          { color: '#CC0000', abbr: 'FG',  logoUrl: gf('fiveguys.com') },
  dunkin:               { color: '#FF671F', abbr: 'DD',  logoUrl: gf('dunkindonuts.com') },
  "dunkin'":            { color: '#FF671F', abbr: 'DD',  logoUrl: gf('dunkindonuts.com') },
  'tim hortons':        { color: '#CC0000', abbr: 'TH',  logoUrl: gf('timhortons.com') },
  "arby's":             { color: '#CC0000', abbr: 'A',   logoUrl: gf('arbys.com') },
  arbys:                { color: '#CC0000', abbr: 'A',   logoUrl: gf('arbys.com') },
  sonic:                { color: '#E31837', abbr: 'SON', logoUrl: gf('sonicdrivein.com') },
  'dairy queen':        { color: '#CC0000', abbr: 'DQ',  logoUrl: gf('dairyqueen.com') },
  'jack in the box':    { color: '#E31837', abbr: 'JB',  logoUrl: gf('jackinthebox.com') },
  'in-n-out':           { color: '#CC0000', abbr: 'INO', logoUrl: gf('in-n-out.com') },
  whataburger:          { color: '#F47920', abbr: 'WB',  logoUrl: gf('whataburger.com') },
  "hardee's":           { color: '#CC0000', abbr: 'H',   logoUrl: gf('hardees.com') },
  "carl's jr":          { color: '#CC0000', abbr: 'CJ',  logoUrl: gf('carlsjr.com') },
  'raising cane':       { color: '#FDD835', abbr: 'RC',  logoUrl: gf('raisingcanes.com') },
  wingstop:             { color: '#CC0000', abbr: 'WS',  logoUrl: gf('wingstop.com') },
  'panda express':      { color: '#CC0000', abbr: 'PE',  logoUrl: gf('pandaexpress.com') },
  'olive garden':       { color: '#4E8A35', abbr: 'OG',  logoUrl: gf('olivegarden.com') },
  "applebee's":         { color: '#CC0000', abbr: 'AB',  logoUrl: gf('applebees.com') },
  applebees:            { color: '#CC0000', abbr: 'AB',  logoUrl: gf('applebees.com') },
  "chili's":            { color: '#CC0000', abbr: 'CH',  logoUrl: gf('chilis.com') },
  chilis:               { color: '#CC0000', abbr: 'CH',  logoUrl: gf('chilis.com') },
  "denny's":            { color: '#FEBC11', abbr: 'D',   logoUrl: gf('dennys.com') },
  dennys:               { color: '#FEBC11', abbr: 'D',   logoUrl: gf('dennys.com') },
  'cracker barrel':     { color: '#B5451B', abbr: 'CB',  logoUrl: gf('crackerbarrel.com') },
  outback:              { color: '#8B0000', abbr: 'OS',  logoUrl: gf('outback.com') },
  'red lobster':        { color: '#CC0000', abbr: 'RL',  logoUrl: gf('redlobster.com') },
  'buffalo wild':       { color: '#FF8200', abbr: 'BW',  logoUrl: gf('buffalowildwings.com') },
  "jersey mike's":      { color: '#CC0000', abbr: 'JM',  logoUrl: gf('jerseymikes.com') },
  "jimmy john's":       { color: '#000000', abbr: 'JJ',  logoUrl: gf('jimmyjohns.com') },
  firehouse:            { color: '#CC0000', abbr: 'FH',  logoUrl: gf('firehousesubs.com') },
  sweetgreen:           { color: '#3D9B35', abbr: 'SG',  logoUrl: gf('sweetgreen.com') },
  cava:                 { color: '#CC0000', abbr: 'CA',  logoUrl: gf('cava.com') },
  qdoba:                { color: '#CC0000', abbr: 'QD',  logoUrl: gf('qdoba.com') },

  // ── Coffee / Bakery ───────────────────────────────────────────────────────
  'dutch bros':         { color: '#005DAA', abbr: 'DB',  logoUrl: gf('dutchbros.com') },
  caribou:              { color: '#7B3F00', abbr: 'CC',  logoUrl: gf('cariboucoffee.com') },
  einstein:             { color: '#003DA5', abbr: 'EB',  logoUrl: gf('einsteinbros.com') },

  // ── Online / Delivery ─────────────────────────────────────────────────────
  amazon:               { color: '#FF9900', abbr: 'A',   logoUrl: gf('amazon.com') },
  instacart:            { color: '#43B02A', abbr: 'IC',  logoUrl: gf('instacart.com') },
  doordash:             { color: '#FF3008', abbr: 'DD',  logoUrl: gf('doordash.com') },
  'door dash':          { color: '#FF3008', abbr: 'DD',  logoUrl: gf('doordash.com') },
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
 * Returns brand color, abbreviation, and logo URL for a store name.
 * Unknown stores use a safe letter chip rather than guessing a brand domain.
 */
export function getStoreBrand(
  name: string,
  fallbackColor?: string,
): StoreBrand {
  const key = name.toLowerCase().trim();
  for (const [k, brand] of Object.entries(BRANDS)) {
    if (key === k || key.includes(k)) return brand;
  }

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
