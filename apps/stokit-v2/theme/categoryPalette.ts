/**
 * Category badge colors with light + dark variants.
 *
 * Accepts BOTH category vocabularies in the app — the Title-Case names from
 * constants/pantryCatalog.ts and the snake_case names from
 * core/services/itemClassifier.ts — and maps them onto one set of color
 * families so item badges look identical everywhere.
 */

type CategoryColors = { bg: string; fg: string };
type Family = { light: CategoryColors; dark: CategoryColors };

const FAMILIES = {
  green: { light: { bg: '#DCFCE7', fg: '#16A34A' }, dark: { bg: '#0D2018', fg: '#34D399' } },
  amber: { light: { bg: '#FEF3C7', fg: '#D97706' }, dark: { bg: '#262012', fg: '#FBBF24' } },
  red: { light: { bg: '#FEE2E2', fg: '#DC2626' }, dark: { bg: '#2D1212', fg: '#F87171' } },
  blue: { light: { bg: '#DBEAFE', fg: '#2563EB' }, dark: { bg: '#10192D', fg: '#60A5FA' } },
  orange: { light: { bg: '#FFEDD5', fg: '#EA580C' }, dark: { bg: '#2A180C', fg: '#FB923C' } },
  sky: { light: { bg: '#E0F2FE', fg: '#0284C7' }, dark: { bg: '#0C1F2D', fg: '#38BDF8' } },
  stone: { light: { bg: '#F5F5F4', fg: '#57534E' }, dark: { bg: '#1F1E1C', fg: '#A8A29E' } },
  slate: { light: { bg: '#F1F5F9', fg: '#475569' }, dark: { bg: '#1B2026', fg: '#94A3B8' } },
  cyan: { light: { bg: '#CFFAFE', fg: '#0891B2' }, dark: { bg: '#0A2226', fg: '#22D3EE' } },
  yellow: { light: { bg: '#FEF9C3', fg: '#CA8A04' }, dark: { bg: '#232008', fg: '#FACC15' } },
  pink: { light: { bg: '#FCE7F3', fg: '#DB2777' }, dark: { bg: '#2A0F1D', fg: '#F472B6' } },
  violet: { light: { bg: '#EDE9FE', fg: '#7C3AED' }, dark: { bg: '#1C1530', fg: '#A78BFA' } },
} satisfies Record<string, Family>;

const CATEGORY_FAMILY: Record<string, keyof typeof FAMILIES> = {
  // pantryCatalog (Title Case)
  Produce: 'green',
  Dairy: 'amber',
  Meat: 'red',
  Seafood: 'blue',
  Bakery: 'orange',
  Frozen: 'sky',
  'Dry Goods': 'stone',
  Canned: 'slate',
  Spices: 'orange',
  Drinks: 'cyan',
  Snacks: 'yellow',
  Kitchen: 'slate',
  Cleaning: 'sky',
  'Paper Goods': 'slate',
  'Personal Care': 'pink',
  Baby: 'pink',
  Pet: 'violet',
  Other: 'slate',

  // itemClassifier (snake_case)
  produce_fruit: 'green',
  produce_veg: 'green',
  dairy: 'amber',
  eggs: 'amber',
  baking: 'amber',
  meat: 'red',
  seafood: 'blue',
  bread: 'orange',
  spice: 'orange',
  frozen: 'sky',
  cleaning: 'sky',
  laundry: 'sky',
  grains: 'stone',
  pasta: 'stone',
  canned: 'slate',
  paper: 'slate',
  household: 'slate',
  oil: 'slate',
  other: 'slate',
  beverage: 'cyan',
  coffee_tea: 'cyan',
  alcohol: 'cyan',
  snack: 'yellow',
  sweet: 'yellow',
  condiment: 'yellow',
  sauce: 'yellow',
  personal_care: 'pink',
  medicine: 'pink',
  baby: 'pink',
  pet: 'violet',
};

export function getCategoryColors(category: string, isDark: boolean): CategoryColors {
  const family = FAMILIES[CATEGORY_FAMILY[category] ?? 'slate'];
  return isDark ? family.dark : family.light;
}
