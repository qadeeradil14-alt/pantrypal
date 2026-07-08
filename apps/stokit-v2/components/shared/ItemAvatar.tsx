import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { PANTRY_CATALOG, type PantryCatalogItem } from '../../constants/pantryCatalog';
import { getCategoryColors } from '../../theme/categoryPalette';

const CUSTOM_EMOJIS: Record<string, any> = {
  'custom:toothpaste': require('../../assets/custom-emojis/toothpaste.png'),
  'custom:shampoo': require('../../assets/custom-emojis/shampoo.png'),
  'custom:conditioner': require('../../assets/custom-emojis/conditioner.png'),
  'custom:bodywash': require('../../assets/custom-emojis/bodywash.png'),
  'custom:deodorant': require('../../assets/custom-emojis/deodorant.png'),
  'custom:lotion': require('../../assets/custom-emojis/lotion.png'),
  'custom:dishsoap': require('../../assets/custom-emojis/dishsoap.png'),
  'custom:handsoap': require('../../assets/custom-emojis/handsoap.png'),
  'custom:laundry_detergent': require('../../assets/custom-emojis/laundry_detergent.png'),
  'custom:fabric_softener': require('../../assets/custom-emojis/fabric_softener.png'),
  'custom:bleach': require('../../assets/custom-emojis/bleach.png'),
  'custom:all_purpose_cleaner': require('../../assets/custom-emojis/all_purpose_cleaner.png'),
  'custom:glass_cleaner': require('../../assets/custom-emojis/glass_cleaner.png'),
  'custom:wipes': require('../../assets/custom-emojis/wipes.png'),
  'custom:trash_bags': require('../../assets/custom-emojis/trash_bags.png'),
  'custom:ketchup': require('../../assets/custom-emojis/ketchup.png'),
  'custom:mustard': require('../../assets/custom-emojis/mustard.png'),
};

// Icons for commonly typed items that are not in the catalog
const ITEM_ICON: Record<string, string> = {
  'hummus': '🫙', 'salsa': '🫙', 'guacamole': '🥑', 'ranch': '🫙',
  'ranch dressing': '🫙', 'bbq sauce': '🫙', 'sriracha': '🌶️',
  'teriyaki': '🫙', 'teriyaki sauce': '🫙', 'tahini': '🫙',
  'pesto': '🌿', 'marinara': '🍅', 'pasta sauce': '🍅', 'alfredo': '🫙',
  'baking soda': '🌾', 'baking powder': '🌾', 'vanilla extract': '🫙',
  'chocolate chips': '🍫', 'brown sugar': '🍬', 'cocoa powder': '🍫',
  'yeast': '🌾', 'cornstarch': '🌾',
  'beer': '🍺', 'wine': '🍷', 'vodka': '🥃', 'whiskey': '🥃',
  'kombucha': '🫙', 'iced tea': '🧃', 'lemonade': '🧃',
  'sweet potato': '🍠', 'yam': '🍠', 'mushroom': '🍄', 'mushrooms': '🍄',
  'jalapeño': '🌶️', 'jalapeno': '🌶️', 'zucchini': '🥒', 'asparagus': '🥦',
  'kale': '🥬', 'mango': '🥭', 'peach': '🍑', 'pear': '🍐',
  'cherry': '🍒', 'cherries': '🍒', 'pineapple': '🍍', 'coconut': '🥥',
  'kiwi': '🥝', 'grapefruit': '🍊', 'basil': '🌿', 'cilantro': '🌿',
  'parsley': '🌿', 'rosemary': '🌿', 'thyme': '🌿', 'dill': '🌿',
  'ham': '🥩', 'pork': '🥩', 'salami': '🥩', 'pepperoni': '🥩',
  'tofu': '🍱', 'tempeh': '🍱',
  'oysters': '🦪', 'clams': '🦪', 'scallops': '🦐',
  'broth': '🍲', 'chicken broth': '🍲', 'beef broth': '🍲',
  'vegetable broth': '🍲', 'stock': '🍲', 'coconut milk': '🥛',
  'sunscreen': '☀️', 'dental floss': '🦷', 'floss': '🦷',
  'mouthwash': '🫙', 'cotton balls': '🌸', 'lip balm': '💄',
  'vitamins': '💊', 'ibuprofen': '💊', 'tylenol': '💊', 'aspirin': '💊',
  'protein powder': '💪', 'band aid': '🩹', 'bandaids': '🩹',
  'batteries': '🔋', 'light bulbs': '💡', 'candle': '🕯️',
  'air freshener': '🌸', 'matches': '🔥',

  // Common items with no dedicated catalog entry — closest safe existing icon
  'pepper': '🌶️', 'beef': '🥩', 'fish': '🐟', 'cream': '🫗',
  'berries': '🍓', 'soap': '🧼', 'bar soap': '🧼',
  'detergent': 'custom:laundry_detergent', 'foil': 'mdi:paper-roll-outline',
  'stock cube': '🍲', 'bouillon': '🍲', 'bouillon cube': '🍲',
  'mayo': '🫙',

  // Mission-required aliases/synonyms (targets already covered by the
  // catalog or the entries above — only the synonym itself is new here)
  'capsicum': '🫑',
  'coriander': '🌿',
  'scallion': '🧅', 'green onion': '🧅',
  'minced beef': '🥩',
  'soft drink': '🥤',
  'kitchen towel': '🧻',
};

// Safe per-category fallback — guarantees no blank box
const CATEGORY_ICON: Record<string, string> = {
  'Produce': '🥬', 'Dairy': '🥛', 'Meat': '🥩', 'Seafood': '🐟',
  'Bakery': '🍞', 'Frozen': '🧊', 'Dry Goods': '🌾', 'Canned': '🥫',
  'Spices': '🧂', 'Drinks': '🥤', 'Snacks': '🍿', 'Kitchen': '🍽️',
  'Cleaning': '🧹', 'Paper Goods': '🧻', 'Personal Care': '🧴',
  'Baby': '👶', 'Pet': '🐾', 'Other': '🛒',
  'Automotive': '🚗', 'Hardware': '🧰', 'Health': '💊', 'Office': '🗂️',
};

// Lowercase, trim, collapse whitespace, and strip simple punctuation before
// any lookup — keeps matching resilient to how a name was typed.
function normalizeForIcon(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:"'’]/g, '')
    .replace(/\s+/g, ' ');
}

// Tries an exact match first, then tolerates a simple trailing-"s" plural
// mismatch in either direction (input vs. stored key) without ever mangling
// words that merely end in "s" but aren't plural (e.g. "hummus").
function lookupTolerant<T>(map: Record<string, T>, normalized: string): T | undefined {
  if (map[normalized] !== undefined) return map[normalized];
  if (normalized.length > 4 && normalized.endsWith('s') && !normalized.endsWith('ss')) {
    const singular = normalized.slice(0, -1);
    if (map[singular] !== undefined) return map[singular];
  }
  const plural = `${normalized}s`;
  if (map[plural] !== undefined) return map[plural];
  return undefined;
}

const CATALOG_BY_NAME: Record<string, PantryCatalogItem> = {};
for (const item of PANTRY_CATALOG) {
  const key = normalizeForIcon(item.name);
  if (CATALOG_BY_NAME[key] === undefined) CATALOG_BY_NAME[key] = item;
}

interface ItemAvatarProps {
  name: string;
  size?: number;
  icon?: string;
}

export function ItemAvatar({ name, size = 44, icon }: ItemAvatarProps) {
  const { isDark } = useTheme();

  const normalized = normalizeForIcon(name);
  const catalogItem = lookupTolerant(CATALOG_BY_NAME, normalized);
  const category = catalogItem?.category ?? 'Other';
  const categoryTheme = getCategoryColors(category, isDark);

  const matchedIcon = icon || catalogItem?.icon || lookupTolerant(ITEM_ICON, normalized);

  // Box-proof resolution chain: specific icon > category emoji > final
  // '🛒' guarantee. Never renders blank space.
  const isCustom = !!matchedIcon && matchedIcon.startsWith('custom:');
  const isMdi = !!matchedIcon && matchedIcon.startsWith('mdi:');
  const emoji = isCustom || isMdi ? undefined : matchedIcon || CATEGORY_ICON[category] || '🛒';

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: categoryTheme.bg,
          borderColor: categoryTheme.bg,
        },
      ]}
    >
      {isCustom ? (
        <Image
          source={CUSTOM_EMOJIS[matchedIcon as string]}
          style={{ width: size * 0.7, height: size * 0.7 }}
          resizeMode="contain"
        />
      ) : isMdi ? (
        <MaterialCommunityIcons
          name={(matchedIcon as string).slice(4) as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
          size={size * 0.55}
          color={categoryTheme.fg}
        />
      ) : (
        <Text style={[styles.emoji, { fontSize: size * 0.55 }]}>
          {emoji}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emoji: {
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
