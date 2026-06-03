import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import AppIcon from './AppIcon';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';

// Master domain map — every entry gets Clearbit (512px PNG) + Google favicon fallback.
// Keys are normalized (lowercase, punctuation stripped). Partial-match lookup handles
// variants like "Walmart Supercenter" matching "walmart".
const STORE_DOMAIN_MAP: Record<string, string> = {
  // ── Supercenters & Mass Retail ──
  walmart: 'walmart.com',
  supercenter: 'walmart.com',
  'walmart supercenter': 'walmart.com',
  'walmart neighborhood': 'walmart.com',
  target: 'target.com',
  costco: 'costco.com',
  'costco tire': 'costco.com',
  'costco wholesale': 'costco.com',
  'costco gas': 'costco.com',
  'sams club': 'samsclub.com',
  'sam s club': 'samsclub.com',
  samclub: 'samsclub.com',
  bjs: 'bjs.com',
  'bj s': 'bjs.com',
  'bj s wholesale': 'bjs.com',
  // ── National Grocery Chains ──
  kroger: 'kroger.com',
  publix: 'publix.com',
  safeway: 'safeway.com',
  albertsons: 'albertsons.com',
  meijer: 'meijer.com',
  heb: 'heb.com',
  'h e b': 'heb.com',
  wegmans: 'wegmans.com',
  shoprite: 'shoprite.com',
  'shop rite': 'shoprite.com',
  'food lion': 'foodlion.com',
  'harris teeter': 'harristeeter.com',
  'stop and shop': 'stopandshop.com',
  'stop shop': 'stopandshop.com',
  'giant food': 'giantfood.com',
  giant: 'giantfood.com',
  'giant eagle': 'gianteagle.com',
  winco: 'wincofoods.com',
  'lucky supermarket': 'luckysupermarkets.com',
  'lucky stores': 'luckysupermarkets.com',
  vons: 'vons.com',
  ralphs: 'ralphs.com',
  fry: 'fredmeyer.com',
  'fred meyer': 'fredmeyer.com',
  'king soopers': 'kingsoopers.com',
  'smith s': 'smithsfoodanddrug.com',
  smiths: 'smithsfoodanddrug.com',
  'dillons': 'dillons.com',
  'baker s': 'bakersplus.com',
  'pay less': 'paylesssupermarkets.com',
  'quality food': 'qfc.com',
  qfc: 'qfc.com',
  'pick n save': 'picknsave.com',
  mariano: 'marianos.com',
  'marianos': 'marianos.com',
  // ── Discount Grocery ──
  aldi: 'aldi.us',
  lidl: 'lidl.com',
  'save a lot': 'savealot.com',
  'grocery outlet': 'groceryoutlet.com',
  'price chopper': 'pricechopper.com',
  'market basket': 'marketbasket.com',
  'winn dixie': 'winndixie.com',
  'bi lo': 'bilo.com',
  'food 4 less': 'food4less.com',
  // ── Natural & Specialty ──
  'whole foods': 'wholefoodsmarket.com',
  'whole foods market': 'wholefoodsmarket.com',
  'trader joes': 'traderjoes.com',
  'trader joe s': 'traderjoes.com',
  sprouts: 'sprouts.com',
  'moms organic': 'momsorganicmarket.com',
  'mom s organic': 'momsorganicmarket.com',
  'moms organic market': 'momsorganicmarket.com',
  'mom s organic market': 'momsorganicmarket.com',
  'natural grocers': 'naturalgrocers.com',
  'fresh thyme': 'freshthyme.com',
  'earth fare': 'earthfare.com',
  'fresh market': 'thefreshmarket.com',
  'lucky s': 'luckysupermarkets.com',
  'bristol farms': 'bristolfarms.com',
  'gelson': 'gelsons.com',
  'metropolitan market': 'metropolitan-market.com',
  // ── Asian & Ethnic ──
  'h mart': 'hmart.com',
  hmart: 'hmart.com',
  'lotte plaza': 'lotteplaza.com',
  'lotte plaza market': 'lotteplaza.com',
  mitsuwa: 'mitsuwa.com',
  'seafood city': 'seafoodcity.com',
  'ranch 99': '99ranch.com',
  '99 ranch': '99ranch.com',
  'hong kong': 'hkmarket.com',
  'international food': 'internationalfoodmarket.com',
  // ── Dollar & Discount ──
  'dollar general': 'dollargeneral.com',
  'family dollar': 'familydollar.com',
  'dollar tree': 'dollartree.com',
  'five below': 'fivebelow.com',
  'big lots': 'biglots.com',
  // ── Pharmacy & Convenience ──
  cvs: 'cvs.com',
  'cvs pharmacy': 'cvs.com',
  walgreens: 'walgreens.com',
  'rite aid': 'riteaid.com',
  '7 eleven': '7-eleven.com',
  '7eleven': '7-eleven.com',
  wawa: 'wawa.com',
  sheetz: 'sheetz.com',
  caseys: 'caseys.com',
  'casey s': 'caseys.com',
  quicktrip: 'quiktrip.com',
  'quick trip': 'quiktrip.com',
  quiktrip: 'quiktrip.com',
  circle: 'circlek.com',
  'circle k': 'circlek.com',
  'circle k store': 'circlek.com',
  'ampm': 'ampm.com',
  'am pm': 'ampm.com',
  speedway: 'speedway.com',
  sunoco: 'sunoco.com',
  bp: 'bp.com',
  shell: 'shell.com',
  exxon: 'exxon.com',
  chevron: 'chevron.com',
  // ── Home Improvement ──
  'home depot': 'homedepot.com',
  lowes: 'lowes.com',
  lowe: 'lowes.com',
  'ace hardware': 'acehardware.com',
  'true value': 'truevalue.com',
  'harbor freight': 'harborfreight.com',
  // ── Big Box Non-grocery ──
  'best buy': 'bestbuy.com',
  ikea: 'ikea.com',
  'bed bath': 'bedbathandbeyond.com',
  // ── Online / Delivery ──
  amazon: 'amazon.com',
  'amazon fresh': 'amazon.com',
  instacart: 'instacart.com',
  doordash: 'doordash.com',
  // ── Restaurant / Fast Food (for receipt scanning) ──
  mcdonalds: 'mcdonalds.com',
  'mc donalds': 'mcdonalds.com',
  starbucks: 'starbucks.com',
  subway: 'subway.com',
  chipotle: 'chipotle.com',
  'chick fil a': 'chick-fil-a.com',
  'chickfila': 'chick-fil-a.com',
  'taco bell': 'tacobell.com',
  'burger king': 'bk.com',
  wendys: 'wendys.com',
  panera: 'panerabread.com',
  'panera bread': 'panerabread.com',
  dominos: 'dominos.com',
  "domino s": 'dominos.com',
  "papa john s": 'papajohns.com',
  'papa johns': 'papajohns.com',
  'pizza hut': 'pizzahut.com',
  dunkin: 'dunkindonuts.com',
  "dunkin donuts": 'dunkindonuts.com',
  'krispy kreme': 'krispykreme.com',
};

// Wikipedia SVG-PNG fallbacks — high quality for stores where Clearbit may fail
const LOGO_IMAGES: Record<string, string> = {
  walmart: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Walmart_logo_%282025%29.svg/960px-Walmart_logo_%282025%29.svg.png',
  supercenter: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Walmart_logo_%282025%29.svg/960px-Walmart_logo_%282025%29.svg.png',
  costco: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Costco_Wholesale_logo_2010-10-26.svg/960px-Costco_Wholesale_logo_2010-10-26.svg.png',
  'sams club': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Sam%27s_Club_Logo_2020.svg/960px-Sam%27s_Club_Logo_2020.svg.png',
  'sam s club': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Sam%27s_Club_Logo_2020.svg/960px-Sam%27s_Club_Logo_2020.svg.png',
  kroger: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Kroger_logo_%281961-2019%29.svg/960px-Kroger_logo_%281961-2019%29.svg.png',
  'food lion': 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Food_lion.png',
  publix: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Publix_Logo.svg/960px-Publix_Logo.svg.png',
  target: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Target_logo.svg/960px-Target_logo.svg.png',
  aldi: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Aldi_S%C3%BCd_2017_logo.svg/960px-Aldi_S%C3%BCd_2017_logo.svg.png',
  'whole foods': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Whole_Foods_Market_201x_logo.svg/960px-Whole_Foods_Market_201x_logo.svg.png',
  'whole foods market': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Whole_Foods_Market_201x_logo.svg/960px-Whole_Foods_Market_201x_logo.svg.png',
  'trader joes': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Trader_Joes_Logo.svg/960px-Trader_Joes_Logo.svg.png',
  'trader joe s': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Trader_Joes_Logo.svg/960px-Trader_Joes_Logo.svg.png',
  giant: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Giant_Food_2008_logo.svg/960px-Giant_Food_2008_logo.svg.png',
  'giant food': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Giant_Food_2008_logo.svg/960px-Giant_Food_2008_logo.svg.png',
  starbucks: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d3/Starbucks_Corporation_Logo_2011.svg/960px-Starbucks_Corporation_Logo_2011.svg.png',
  mcdonalds: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/McDonald%27s_Golden_Arches.svg/960px-McDonald%27s_Golden_Arches.svg.png',
  'mc donalds': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/McDonald%27s_Golden_Arches.svg/960px-McDonald%27s_Golden_Arches.svg.png',
  amazon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Amazon_logo.svg/960px-Amazon_logo.svg.png',
  ikea: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Ikea_logo.svg/960px-Ikea_logo.svg.png',
};

function normalizeStoreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['’.-]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function initials(name: string): string {
  const parts = normalizeStoreName(name).split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

/** Derive candidate domains from any store name for Clearbit guessing.
 * Returns multiple variants: "Kabul Halal Market" → ["kabulhalalmarket.com", "kabul.com"] */
function guessDomains(name: string): string[] {
  const norm = normalizeStoreName(name);
  const words = norm.split(' ').filter(Boolean);
  return [
    words.join('') + '.com',          // kabulhalalmarket.com
    words[0] + '.com',                 // kabul.com
    words.slice(0, 2).join('') + '.com', // kabulhalal.com
  ].filter((d, i, arr) => arr.indexOf(d) === i); // dedupe
}

function logoSources(name: string): string[] {
  const normalized = normalizeStoreName(name);

  // 1. Exact match in master domain map
  const knownDomain =
    STORE_DOMAIN_MAP[normalized] ??
    Object.entries(STORE_DOMAIN_MAP).find(([key]) => normalized.includes(key))?.[1];

  // 2. Wikipedia SVG-PNG — high quality for major chains
  const wikiImg =
    LOGO_IMAGES[normalized] ??
    Object.entries(LOGO_IMAGES).find(([key]) => normalized.includes(key))?.[1];

  // 3. Smart guesses via Clearbit — try multiple domain variants
  const guessed = guessDomains(name);

  const sources: (string | null)[] = [
    // Wikipedia first for known stores — verified URLs, higher quality than Clearbit.
    // Clearbit sometimes returns wrong logos (e.g. Publix for giantfood.com).
    wikiImg ?? null,
    knownDomain ? `https://logo.clearbit.com/${knownDomain}?size=512` : null,
    knownDomain ? `https://www.google.com/s2/favicons?sz=256&domain=${knownDomain}` : null,
    // If no known domain, try guessed domains through Clearbit
    !knownDomain ? `https://logo.clearbit.com/${guessed[0]}?size=512` : null,
    !knownDomain ? `https://logo.clearbit.com/${guessed[1]}?size=512` : null,
    // Google favicon always last — works for virtually any domain
    `https://www.google.com/s2/favicons?sz=256&domain=${knownDomain ?? guessed[0]}`,
  ];

  return sources.filter(Boolean) as string[];
}

interface Props {
  name: string;
  size?: number;
  domain?: string | null;
  logoUrl?: string | null;
  /** When no remote logo resolves, show the Stokit app icon instead of store initials. */
  fallbackToAppIcon?: boolean;
}

export default function StoreLogo({ name, size = 34, domain, logoUrl, fallbackToAppIcon = false }: Props) {
  const { colors } = useTheme();
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(() => [
    logoUrl,
    domain ? `https://logo.clearbit.com/${domain}?size=512` : null,
    domain ? `https://www.google.com/s2/favicons?sz=256&domain=${domain}` : null,
    ...logoSources(name),
  ].filter(Boolean) as string[], [domain, logoUrl, name]);
  const styles = useMemo(() => makeStyles(colors, size, sources.length > 0), [colors, size, sources.length]);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  if (sources[sourceIndex]) {
    return (
      <View style={styles.logoWrap}>
        <Image
          source={{ uri: sources[sourceIndex] }}
          style={styles.image}
          resizeMode="contain"
          onError={() => setSourceIndex((idx) => idx + 1)}
        />
      </View>
    );
  }

  if (fallbackToAppIcon) {
    return <AppIcon size={size} />;
  }

  return (
    <View style={styles.initialWrap}>
      <Text style={styles.initials}>{initials(name)}</Text>
    </View>
  );
}

function makeStyles(colors: AppColors, size: number, hasLogo: boolean) {
  const logoWidth = hasLogo ? Math.round(size * 1.55) : size;
  return StyleSheet.create({
    logoWrap: {
      width: logoWidth,
      height: size,
      borderRadius: Math.round(size * 0.28),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: Math.max(4, Math.round(size * 0.14)),
      paddingVertical: Math.max(3, Math.round(size * 0.12)),
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    initialWrap: {
      width: size,
      height: size,
      borderRadius: Math.round(size / 2),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    initials: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      fontSize: Math.max(11, Math.round(size * 0.32)),
      letterSpacing: 0,
    },
  });
}
