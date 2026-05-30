import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';

// Clearbit logo CDN — returns clean 512×512 PNGs with transparent background
// Used as the primary logo source for all known store domains.
const LOGO_CLEARBIT: Record<string, string> = {
  walmart: 'walmart.com',
  supercenter: 'walmart.com',
  costco: 'costco.com',
  'costco tire': 'costco.com',
  'costco wholesale': 'costco.com',
  'sams club': 'samsclub.com',
  'sam s club': 'samsclub.com',
  samclub: 'samsclub.com',
  kroger: 'kroger.com',
  publix: 'publix.com',
  target: 'target.com',
  aldi: 'aldi.us',
  'whole foods': 'wholefoodsmarket.com',
  'whole foods market': 'wholefoodsmarket.com',
  'trader joes': 'traderjoes.com',
  'trader joe s': 'traderjoes.com',
  giant: 'giantfood.com',
  'giant food': 'giantfood.com',
  heb: 'heb.com',
  'h e b': 'heb.com',
  safeway: 'safeway.com',
  meijer: 'meijer.com',
  'stop shop': 'stopandshop.com',
  'stop and shop': 'stopandshop.com',
  wegmans: 'wegmans.com',
  lidl: 'lidl.com',
  'dollar general': 'dollargeneral.com',
  'family dollar': 'familydollar.com',
  'dollar tree': 'dollartree.com',
  'food lion': 'foodlion.com',
  sprouts: 'sprouts.com',
  albertsons: 'albertsons.com',
  winco: 'wincofoods.com',
  'harris teeter': 'harristeeter.com',
  'fresh market': 'thefreshmarket.com',
  // Convenience & pharmacy
  '7 eleven': '7-eleven.com',
  '7eleven': '7-eleven.com',
  cvs: 'cvs.com',
  'cvs pharmacy': 'cvs.com',
  walgreens: 'walgreens.com',
  'rite aid': 'riteaid.com',
  // Home improvement & hardware
  'home depot': 'homedepot.com',
  lowes: 'lowes.com',
  'ace hardware': 'acehardware.com',
  // Warehouse & wholesale
  bjs: 'bjs.com',
  "bj s wholesale": 'bjs.com',
  // Specialty grocery
  'fresh thyme': 'freshthyme.com',
  'natural grocers': 'naturalgrocers.com',
  'earth fare': 'earthfare.com',
  'lucky supermarket': 'luckysupermarkets.com',
  // Discount / dollar stores
  'five below': 'fivebelow.com',
  // Big box
  'best buy': 'bestbuy.com',
  // Gas station convenience
  wawa: 'wawa.com',
  sheetz: 'sheetz.com',
  'casey s': 'caseys.com',
  caseys: 'caseys.com',
  quicktrip: 'quiktrip.com',
  'quick trip': 'quiktrip.com',
  // Ethnic & specialty
  'h mart': 'hmart.com',
  hmart: 'hmart.com',
  'mitsuwa': 'mitsuwa.com',
  'la curacao': 'lacuracao.com',
};

// Wikipedia SVG-PNG fallbacks (960 px wide, very high quality)
const LOGO_IMAGES: Record<string, string> = {
  walmart: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Walmart_logo_%282025%29.svg/960px-Walmart_logo_%282025%29.svg.png',
  supercenter: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Walmart_logo_%282025%29.svg/960px-Walmart_logo_%282025%29.svg.png',
  costco: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Costco_Wholesale_logo_2010-10-26.svg/960px-Costco_Wholesale_logo_2010-10-26.svg.png',
  'sams club': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Sam%27s_Club_Logo_2020.svg/960px-Sam%27s_Club_Logo_2020.svg.png',
  'sam s club': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Sam%27s_Club_Logo_2020.svg/960px-Sam%27s_Club_Logo_2020.svg.png',
  samclub: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Sam%27s_Club_Logo_2020.svg/960px-Sam%27s_Club_Logo_2020.svg.png',
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
};

const LOGO_DOMAINS: Record<string, string> = {
  heb: 'heb.com',
  'h e b': 'heb.com',
  safeway: 'safeway.com',
  meijer: 'meijer.com',
  'stop shop': 'stopandshop.com',
  'stop and shop': 'stopandshop.com',
  wegmans: 'wegmans.com',
  lidl: 'lidl.com',
  'dollar general': 'dollargeneral.com',
  'family dollar': 'familydollar.com',
  'dollar tree': 'dollartree.com',
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

/** Derive a guessed domain from any store name, e.g. "Kabul Halal Market" → "kabulhalalmarket.com" */
function guessDomain(name: string): string {
  return normalizeStoreName(name).replace(/\s+/g, '') + '.com';
}

function logoSources(name: string): string[] {
  const normalized = normalizeStoreName(name);

  // 1. Clearbit — clean 512×512 PNGs, best quality
  const clearbitDomain =
    LOGO_CLEARBIT[normalized] ??
    Object.entries(LOGO_CLEARBIT).find(([key]) => normalized.includes(key))?.[1];

  // 2. Wikipedia SVG-PNG — large, reliable fallback
  const wikiImg =
    LOGO_IMAGES[normalized] ??
    Object.entries(LOGO_IMAGES).find(([key]) => normalized.includes(key))?.[1];

  // 3. Known domain fallback
  const fallbackDomain =
    LOGO_DOMAINS[normalized] ??
    Object.entries(LOGO_DOMAINS).find(([key]) => normalized.includes(key))?.[1];

  // 4. Smart guess — try derived domain via Clearbit (works surprisingly often)
  const guessedDomain = guessDomain(name);

  // 5. Google favicon — last resort for any store
  const googleFavicon = `https://www.google.com/s2/favicons?sz=256&domain=${fallbackDomain ?? guessedDomain}`;

  return [
    clearbitDomain ? `https://logo.clearbit.com/${clearbitDomain}?size=512` : null,
    wikiImg ?? null,
    fallbackDomain ? `https://www.google.com/s2/favicons?sz=256&domain=${fallbackDomain}` : null,
    !clearbitDomain ? `https://logo.clearbit.com/${guessedDomain}?size=512` : null,
    googleFavicon,
  ].filter(Boolean) as string[];
}

interface Props {
  name: string;
  size?: number;
  domain?: string | null;
  logoUrl?: string | null;
}

export default function StoreLogo({ name, size = 34, domain, logoUrl }: Props) {
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
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: colors.border,
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
      borderWidth: 1,
      borderColor: colors.border,
    },
    initials: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      fontSize: Math.max(11, Math.round(size * 0.32)),
      letterSpacing: 0,
    },
  });
}
