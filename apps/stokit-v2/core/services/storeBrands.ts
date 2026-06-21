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
  albertsons:           { color: '#0072CE', abbr: 'A',   logoUrl: gf('albertsons.com') },
  'jewel osco':         { color: '#E31837', abbr: 'JO',  logoUrl: gf('jewelosco.com') },
  'king soopers':       { color: '#00539B', abbr: 'KS',  logoUrl: gf('kingsoopers.com') },
  'fred meyer':         { color: '#E31837', abbr: 'FM',  logoUrl: gf('fredmeyer.com') },
  'smiths food':        { color: '#00539B', abbr: 'SF',  logoUrl: gf('smithsfoodanddrug.com') },
  qfc:                  { color: '#00539B', abbr: 'QFC', logoUrl: gf('qfc.com') },
  marianos:             { color: '#6B1D32', abbr: 'M',   logoUrl: gf('marianos.com') },
  'tom thumb':          { color: '#E31837', abbr: 'TT',  logoUrl: gf('tomthumb.com') },
  weis:                 { color: '#00539B', abbr: 'W',   logoUrl: gf('weismarkets.com') },
  'weis markets':       { color: '#00539B', abbr: 'W',   logoUrl: gf('weismarkets.com') },
  schnucks:             { color: '#D71920', abbr: 'S',   logoUrl: gf('schnucks.com') },
  ingles:               { color: '#00539B', abbr: 'I',   logoUrl: gf('ingles-markets.com') },
  rouses:               { color: '#D71920', abbr: 'R',   logoUrl: gf('rouses.com') },
  bashas:               { color: '#D71920', abbr: 'B' },
  'piggly wiggly':      { color: '#E31837', abbr: 'PW',  logoUrl: gf('pigglywiggly.com') },
  'save a lot':         { color: '#F5B335', abbr: 'SL',  logoUrl: gf('savealot.com') },
  'grocery outlet':     { color: '#D71920', abbr: 'GO',  logoUrl: gf('groceryoutlet.com') },
  'h mart':             { color: '#D71920', abbr: 'HM',  logoUrl: gf('hmart.com') },
  '99 ranch':           { color: '#E31837', abbr: '99',  logoUrl: gf('99ranch.com') },
  'seafood city':       { color: '#00539B', abbr: 'SC',  logoUrl: gf('seafoodcity.com') },
  'food bazaar':        { color: '#D71920', abbr: 'FB',  logoUrl: gf('foodbazaar.com') },
  'key food':           { color: '#D71920', abbr: 'KF',  logoUrl: gf('keyfood.com') },
  erewhon:              { color: '#111111', abbr: 'E',   logoUrl: gf('erewhon.com') },
  gelsons:              { color: '#00674B', abbr: 'G',   logoUrl: gf('gelsons.com') },

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

  // ── Home Improvement / Hardware / Garden ─────────────────────────────────
  'home depot':         { color: '#F96302', abbr: 'HD',  logoUrl: gf('homedepot.com') },
  lowes:                { color: '#004990', abbr: 'L',   logoUrl: gf('lowes.com') },
  ace:                  { color: '#CC0000', abbr: 'ACE', logoUrl: gf('acehardware.com') },
  'ace hardware':       { color: '#CC0000', abbr: 'ACE', logoUrl: gf('acehardware.com') },
  menards:              { color: '#0066A4', abbr: 'M',   logoUrl: gf('menards.com') },
  'true value':         { color: '#D71920', abbr: 'TV',  logoUrl: gf('truevalue.com') },
  'tractor supply':     { color: '#D71920', abbr: 'TS',  logoUrl: gf('tractorsupplycompany.com') },
  'harbor freight':     { color: '#00529B', abbr: 'HF',  logoUrl: gf('harborfreight.com') },
  flooranddecor:        { color: '#D71920', abbr: 'FD',  logoUrl: gf('flooranddecor.com') },
  'floor and decor':    { color: '#D71920', abbr: 'FD',  logoUrl: gf('flooranddecor.com') },
  'northern tool':      { color: '#F5B335', abbr: 'NT',  logoUrl: gf('northerntool.com') },
  'rural king':         { color: '#D71920', abbr: 'RK',  logoUrl: gf('ruralking.com') },

  // ── General Merchandise / Household Value ────────────────────────────────
  ikea:                 { color: '#0058A3', abbr: 'IKEA', logoUrl: gf('ikea.com') },
  macys:                { color: '#E21A2C', abbr: 'M',   logoUrl: gf('macys.com') },
  kohls:                { color: '#7A1F3D', abbr: 'K',   logoUrl: gf('kohls.com') },
  'jcpenney':           { color: '#CC0000', abbr: 'JCP', logoUrl: gf('jcpenney.com') },
  'j c penney':         { color: '#CC0000', abbr: 'JCP', logoUrl: gf('jcpenney.com') },
  nordstrom:            { color: '#111111', abbr: 'N',   logoUrl: gf('nordstrom.com') },
  'nordstrom rack':     { color: '#111111', abbr: 'NR',  logoUrl: gf('nordstromrack.com') },
  burlington:           { color: '#D71920', abbr: 'B',   logoUrl: gf('burlington.com') },
  marshalls:            { color: '#003B70', abbr: 'M',   logoUrl: gf('marshalls.com') },
  tjmaxx:               { color: '#D71920', abbr: 'TJ',  logoUrl: gf('tjmaxx.com') },
  'tj maxx':            { color: '#D71920', abbr: 'TJ',  logoUrl: gf('tjmaxx.com') },
  homegoods:            { color: '#7A2E6E', abbr: 'HG',  logoUrl: gf('homegoods.com') },
  'home goods':         { color: '#7A2E6E', abbr: 'HG',  logoUrl: gf('homegoods.com') },
  ross:                 { color: '#00539B', abbr: 'R',   logoUrl: gf('rossstores.com') },
  'ross dress for less': { color: '#00539B', abbr: 'R',  logoUrl: gf('rossstores.com') },
  'big lots':           { color: '#F58220', abbr: 'BL',  logoUrl: gf('biglots.com') },
  ollies:               { color: '#F58220', abbr: 'O',   logoUrl: gf('ollies.us') },
  'dollar tree':        { color: '#007A3D', abbr: 'DT',  logoUrl: gf('dollartree.com') },
  'dollar general':     { color: '#F5D000', abbr: 'DG',  logoUrl: gf('dollargeneral.com') },
  familydollar:         { color: '#E31837', abbr: 'FD',  logoUrl: gf('familydollar.com') },
  'family dollar':      { color: '#E31837', abbr: 'FD',  logoUrl: gf('familydollar.com') },
  fivebelow:            { color: '#0067B1', abbr: '5B',  logoUrl: gf('fivebelow.com') },
  'five below':         { color: '#0067B1', abbr: '5B',  logoUrl: gf('fivebelow.com') },
  'at home':            { color: '#E31837', abbr: 'AH',  logoUrl: gf('athome.com') },
  wayfair:              { color: '#7F187F', abbr: 'W',   logoUrl: gf('wayfair.com') },
  crateandbarrel:       { color: '#111111', abbr: 'CB',  logoUrl: gf('crateandbarrel.com') },
  'crate and barrel':   { color: '#111111', abbr: 'CB',  logoUrl: gf('crateandbarrel.com') },
  potterybarn:          { color: '#5A4637', abbr: 'PB',  logoUrl: gf('potterybarn.com') },
  'pottery barn':       { color: '#5A4637', abbr: 'PB',  logoUrl: gf('potterybarn.com') },
  'bed bath and beyond': { color: '#1B3F8B', abbr: 'BB', logoUrl: gf('bedbathandbeyond.com') },
  'container store':    { color: '#007DBA', abbr: 'CS',  logoUrl: gf('containerstore.com') },
  ashley:               { color: '#D71920', abbr: 'A',   logoUrl: gf('ashleyfurniture.com') },
  'ashley furniture':   { color: '#D71920', abbr: 'A',   logoUrl: gf('ashleyfurniture.com') },
  'rooms to go':        { color: '#E31837', abbr: 'RTG', logoUrl: gf('roomstogo.com') },
  'value city furniture': { color: '#D71920', abbr: 'VC', logoUrl: gf('valuecityfurniture.com') },

  // ── Pet / Office / Crafts ────────────────────────────────────────────────
  petsmart:             { color: '#0072BC', abbr: 'PS',  logoUrl: gf('petsmart.com') },
  petco:                { color: '#0055A5', abbr: 'PC',  logoUrl: gf('petco.com') },
  chewy:                { color: '#1C49C2', abbr: 'C',   logoUrl: gf('chewy.com') },
  staples:              { color: '#CC0000', abbr: 'S',   logoUrl: gf('staples.com') },
  'office depot':       { color: '#CC0000', abbr: 'OD',  logoUrl: gf('officedepot.com') },
  officemax:            { color: '#CC0000', abbr: 'OM',  logoUrl: gf('officedepot.com') },
  'office max':         { color: '#CC0000', abbr: 'OM',  logoUrl: gf('officedepot.com') },
  michaels:             { color: '#CC0000', abbr: 'M',   logoUrl: gf('michaels.com') },
  'hobby lobby':        { color: '#00529B', abbr: 'HL',  logoUrl: gf('hobbylobby.com') },
  joann:                { color: '#7A1D5D', abbr: 'J',   logoUrl: gf('joann.com') },
  ulta:                 { color: '#E36B2C', abbr: 'U',   logoUrl: gf('ulta.com') },
  'ulta beauty':        { color: '#E36B2C', abbr: 'U',   logoUrl: gf('ulta.com') },
  sephora:              { color: '#111111', abbr: 'S',   logoUrl: gf('sephora.com') },
  'sally beauty':       { color: '#7A1D5D', abbr: 'SB',  logoUrl: gf('sallybeauty.com') },
  'bath and body works': { color: '#3D6FA5', abbr: 'BB', logoUrl: gf('bathandbodyworks.com') },

  // ── Electronics / Appliances ─────────────────────────────────────────────
  'best buy':           { color: '#0046BE', abbr: 'BB',  logoUrl: gf('bestbuy.com') },
  apple:                { color: '#111111', abbr: 'A',   logoUrl: gf('apple.com') },
  microcenter:          { color: '#E31837', abbr: 'MC',  logoUrl: gf('microcenter.com') },
  'micro center':       { color: '#E31837', abbr: 'MC',  logoUrl: gf('microcenter.com') },
  gamestop:             { color: '#CC0000', abbr: 'GS',  logoUrl: gf('gamestop.com') },
  'aarons':             { color: '#0072CE', abbr: 'A',   logoUrl: gf('aarons.com') },

  // ── Auto / Tools / Household Maintenance ─────────────────────────────────
  autozone:             { color: '#E31837', abbr: 'AZ',  logoUrl: gf('autozone.com') },
  'advance auto parts': { color: '#D71920', abbr: 'AA',  logoUrl: gf('advanceautoparts.com') },
  oreilly:              { color: '#007A33', abbr: 'OR',  logoUrl: gf('oreillyauto.com') },
  'o reilly auto parts': { color: '#007A33', abbr: 'OR', logoUrl: gf('oreillyauto.com') },
  napa:                 { color: '#00529B', abbr: 'N',   logoUrl: gf('napaonline.com') },
  'napa auto parts':    { color: '#00529B', abbr: 'N',   logoUrl: gf('napaonline.com') },
  pepboys:              { color: '#D71920', abbr: 'PB',  logoUrl: gf('pepboys.com') },
  'pep boys':           { color: '#D71920', abbr: 'PB',  logoUrl: gf('pepboys.com') },
  carquest:             { color: '#D71920', abbr: 'CQ',  logoUrl: gf('carquestprofessionals.com') },
  'discount tire':      { color: '#00529B', abbr: 'DT',  logoUrl: gf('discounttire.com') },

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
function normalizeBrandName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const NORMALIZED_BRANDS = Object.entries(BRANDS)
  .map(([brandName, brand]) => ({ brandName: normalizeBrandName(brandName), brand }))
  .sort((a, b) => b.brandName.length - a.brandName.length);

export function getStoreBrand(
  name: string,
  fallbackColor?: string,
): StoreBrand {
  const key = normalizeBrandName(name);

  for (const entry of NORMALIZED_BRANDS) {
    if (key === entry.brandName || ` ${key} `.includes(` ${entry.brandName} `)) {
      return entry.brand;
    }
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
