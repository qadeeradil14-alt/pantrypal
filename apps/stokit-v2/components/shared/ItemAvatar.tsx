import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { PANTRY_CATALOG } from '../../constants/pantryCatalog';
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
};

// Safe per-category fallback — guarantees no blank box
const CATEGORY_ICON: Record<string, string> = {
  'Produce': '🥬', 'Dairy': '🥛', 'Meat': '🥩', 'Seafood': '🐟',
  'Bakery': '🍞', 'Frozen': '🧊', 'Dry Goods': '🌾', 'Canned': '🥫',
  'Spices': '🧂', 'Drinks': '🥤', 'Snacks': '🍿', 'Kitchen': '🍽️',
  'Cleaning': '🧹', 'Paper Goods': '🧻', 'Personal Care': '🧴',
  'Baby': '👶', 'Pet': '🐾', 'Other': '🛒',
};

interface ItemAvatarProps {
  name: string;
  size?: number;
  icon?: string;
}

export function ItemAvatar({ name, size = 44, icon }: ItemAvatarProps) {
  const { isDark } = useTheme();

  const catalogItem = PANTRY_CATALOG.find((i) => i.name.toLowerCase() === name.toLowerCase());
  const category = catalogItem?.category ?? 'Other';
  const categoryTheme = getCategoryColors(category, isDark);

  // Box-proof resolution chain — '🛒' is the final guarantee
  const iconStr: string =
    icon ||
    (catalogItem?.icon || undefined) ||
    ITEM_ICON[name.toLowerCase().trim()] ||
    CATEGORY_ICON[category] ||
    '🛒';

  const isCustom = iconStr.startsWith('custom:');

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
          source={CUSTOM_EMOJIS[iconStr]}
          style={{ width: size * 0.7, height: size * 0.7 }}
          resizeMode="contain"
        />
      ) : (
        <Text style={[styles.emoji, { fontSize: size * 0.55 }]}>
          {iconStr}
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
