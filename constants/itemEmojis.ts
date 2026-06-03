import type { ItemCategory } from './defaultItems';

type ItemIconGroup = {
  key: string;
  emoji: string;
  aliases: readonly string[];
  keywords?: readonly string[];
};

export type ItemIconResolution = {
  emoji: string;
  matched: boolean;
  itemType?: string;
};

const CATEGORY_FALLBACK_EMOJI: Record<ItemCategory | 'produce' | 'other', string> = {
  fridge: '❄️',
  pantry: '🧺',
  freezer: '🧊',
  produce: '🌿',
  other: '🧺',
};

const ICON_GROUPS: readonly ItemIconGroup[] = [
  { key: 'fruit-apple', emoji: '🍎', aliases: ['apple', 'apples', 'green apple', 'red apple', 'applesauce'], keywords: ['apple'] },
  { key: 'fruit-banana', emoji: '🍌', aliases: ['banana', 'bananas', 'plantain', 'plantains'], keywords: ['banana', 'plantain'] },
  { key: 'fruit-citrus', emoji: '🍊', aliases: ['orange', 'oranges', 'mandarin', 'mandarins', 'clementine', 'clementines', 'grapefruit', 'orange juice', 'lemonade'], keywords: ['orange', 'mandarin', 'clementine', 'grapefruit', 'citrus'] },
  { key: 'fruit-lemon-lime', emoji: '🍋', aliases: ['lemon', 'lemons', 'lime', 'limes'], keywords: ['lemon', 'lime'] },
  { key: 'fruit-grapes', emoji: '🍇', aliases: ['grapes', 'green grapes', 'red grapes', 'black grapes', 'grape juice'], keywords: ['grape'] },
  { key: 'fruit-berries', emoji: '🫐', aliases: ['strawberry', 'strawberries', 'blueberry', 'blueberries', 'raspberry', 'raspberries', 'blackberry', 'blackberries', 'frozen berries', 'frozen strawberries', 'frozen blueberries'], keywords: ['berry', 'berries', 'strawberry', 'blueberry', 'raspberry', 'blackberry'] },
  { key: 'fruit-stone', emoji: '🍑', aliases: ['cherry', 'cherries', 'peach', 'peaches', 'nectarine', 'nectarines', 'plum', 'plums', 'apricot', 'apricots'], keywords: ['cherry', 'peach', 'nectarine', 'plum', 'apricot'] },
  { key: 'fruit-tropical', emoji: '🥭', aliases: ['mango', 'mangoes', 'frozen mango', 'pineapple', 'papaya', 'kiwi', 'coconut', 'dried mango'], keywords: ['mango', 'pineapple', 'papaya', 'kiwi', 'coconut'] },
  { key: 'fruit-melon', emoji: '🍉', aliases: ['watermelon', 'cantaloupe', 'honeydew', 'melon'], keywords: ['melon', 'watermelon', 'cantaloupe', 'honeydew'] },
  { key: 'fruit-avocado', emoji: '🥑', aliases: ['avocado', 'avocados'], keywords: ['avocado'] },
  { key: 'fruit-pear', emoji: '🍐', aliases: ['pear', 'pears'], keywords: ['pear'] },
  { key: 'fruit-date-fig', emoji: '🌴', aliases: ['pomegranate', 'fig', 'figs', 'dates', 'medjool dates', 'dried fruit', 'raisins', 'dried cranberries', 'dried apricots'], keywords: ['pomegranate', 'fig', 'date', 'raisin', 'dried fruit'] },
  { key: 'vegetable-tomato', emoji: '🍅', aliases: ['tomato', 'tomatoes', 'roma tomato', 'cherry tomato', 'grape tomato', 'canned tomatoes', 'tomato paste', 'tomato sauce'], keywords: ['tomato'] },
  { key: 'vegetable-cucumber', emoji: '🥒', aliases: ['cucumber', 'cucumbers', 'persian cucumber', 'english cucumber', 'pickles', 'relish'], keywords: ['cucumber', 'pickle'] },
  { key: 'vegetable-leaf', emoji: '🥬', aliases: ['lettuce', 'romaine lettuce', 'iceberg lettuce', 'butter lettuce', 'spring mix', 'arugula', 'spinach', 'baby spinach', 'kale', 'collard greens', 'mustard greens', 'turnip greens', 'cabbage', 'green cabbage', 'red cabbage', 'napa cabbage', 'bok choy', 'endive', 'radicchio', 'watercress', 'frozen spinach'], keywords: ['lettuce', 'spinach', 'kale', 'greens', 'cabbage', 'arugula', 'bok choy', 'watercress'] },
  { key: 'vegetable-broccoli', emoji: '🥦', aliases: ['broccoli', 'broccolini', 'cauliflower', 'brussels sprouts', 'frozen broccoli'], keywords: ['broccoli', 'cauliflower', 'brussels'] },
  { key: 'vegetable-root', emoji: '🥕', aliases: ['carrots', 'baby carrots', 'beet', 'beets', 'radish', 'daikon radish', 'turnip', 'rutabaga', 'parsnip', 'cassava', 'yucca', 'taro', 'turmeric root', 'ginger'], keywords: ['carrot', 'beet', 'radish', 'turnip', 'rutabaga', 'parsnip', 'cassava', 'yucca', 'taro', 'ginger', 'turmeric'] },
  { key: 'vegetable-celery', emoji: '🌿', aliases: ['celery', 'leeks', 'fennel', 'chives'], keywords: ['celery', 'leek', 'fennel', 'chive'] },
  { key: 'vegetable-onion', emoji: '🧅', aliases: ['onion', 'onions', 'yellow onion', 'red onion', 'white onion', 'green onion', 'scallions', 'shallot', 'shallots'], keywords: ['onion', 'scallion', 'shallot'] },
  { key: 'vegetable-garlic', emoji: '🧄', aliases: ['garlic'], keywords: ['garlic'] },
  { key: 'vegetable-potato', emoji: '🥔', aliases: ['potato', 'potatoes', 'russet potato', 'red potato', 'gold potato', 'sweet potato', 'yams', 'frozen fries', 'tater tots'], keywords: ['potato', 'yam', 'fries', 'tater'] },
  { key: 'vegetable-squash', emoji: '🎃', aliases: ['zucchini', 'yellow squash', 'butternut squash', 'acorn squash', 'spaghetti squash', 'pumpkin', 'bottle gourd', 'ridge gourd', 'snake gourd', 'ash gourd', 'chayote', 'bitter melon'], keywords: ['squash', 'zucchini', 'pumpkin', 'gourd', 'chayote', 'bitter melon'] },
  { key: 'vegetable-eggplant', emoji: '🍆', aliases: ['eggplant', 'baby eggplant'], keywords: ['eggplant'] },
  { key: 'vegetable-pepper', emoji: '🫑', aliases: ['bell pepper', 'bell peppers', 'green bell pepper', 'red bell pepper', 'yellow bell pepper', 'orange bell pepper', 'jalapeno', 'serrano pepper', 'habanero', 'poblano pepper', 'chili pepper', 'banana pepper'], keywords: ['pepper', 'jalapeno', 'serrano', 'habanero', 'poblano', 'chili'] },
  { key: 'vegetable-mushroom', emoji: '🍄', aliases: ['mushrooms', 'white mushrooms', 'cremini mushrooms', 'portobello mushrooms', 'shiitake mushrooms'], keywords: ['mushroom'] },
  { key: 'vegetable-corn-peas', emoji: '🌽', aliases: ['corn', 'corn on the cob', 'peas', 'snow peas', 'sugar snap peas', 'green beans', 'string beans', 'canned corn', 'canned peas', 'canned carrots', 'canned green beans', 'frozen vegetables', 'frozen peas', 'frozen corn'], keywords: ['corn', 'peas', 'green beans', 'string beans', 'frozen vegetables'] },
  { key: 'vegetable-specialty', emoji: '🫛', aliases: ['asparagus', 'artichoke', 'okra'], keywords: ['asparagus', 'artichoke', 'okra'] },
  { key: 'herb-leaf', emoji: '🌿', aliases: ['parsley', 'cilantro', 'coriander leaves', 'mint', 'basil', 'dill', 'rosemary', 'thyme', 'oregano', 'sage', 'curry leaves', 'bay leaves'], keywords: ['parsley', 'cilantro', 'coriander leaves', 'mint', 'basil', 'dill', 'rosemary', 'thyme', 'oregano', 'sage', 'curry leaves', 'bay leaves'] },
  { key: 'protein-chicken', emoji: '🍗', aliases: ['chicken', 'whole chicken', 'chicken breast', 'chicken thighs', 'chicken wings', 'chicken drumsticks', 'ground chicken', 'chicken sausage', 'deli chicken', 'frozen chicken', 'chicken nuggets', 'frozen nuggets'], keywords: ['chicken'] },
  { key: 'protein-turkey', emoji: '🦃', aliases: ['turkey', 'ground turkey', 'turkey breast', 'deli turkey'], keywords: ['turkey'] },
  { key: 'protein-beef', emoji: '🥩', aliases: ['beef', 'ground beef', 'beef steak', 'ribeye', 'sirloin', 'beef stew meat', 'beef ribs', 'deli roast beef'], keywords: ['beef', 'ribeye', 'sirloin', 'steak'] },
  { key: 'protein-lamb', emoji: '🥩', aliases: ['lamb', 'ground lamb', 'lamb chops', 'goat meat', 'mutton', 'veal'], keywords: ['lamb', 'goat', 'mutton', 'veal'] },
  { key: 'protein-pork-deli', emoji: '🥓', aliases: ['pork', 'pork chops', 'bacon', 'sausage', 'beef sausage', 'hot dogs', 'salami', 'pepperoni', 'ham'], keywords: ['pork', 'bacon', 'sausage', 'hot dog', 'salami', 'pepperoni', 'ham'] },
  { key: 'protein-egg', emoji: '🥚', aliases: ['eggs', 'egg', 'egg whites'], keywords: ['egg'] },
  { key: 'protein-plant', emoji: '⬜', aliases: ['tofu', 'firm tofu', 'tempeh', 'seitan'], keywords: ['tofu', 'tempeh', 'seitan'] },
  { key: 'protein-fish', emoji: '🐟', aliases: ['salmon', 'tuna', 'canned tuna', 'cod', 'tilapia', 'sardines', 'canned sardines', 'anchovies', 'fish fillet', 'smoked salmon', 'frozen fish', 'frozen fish sticks', 'frozen salmon'], keywords: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'sardine', 'anchovy'] },
  { key: 'protein-seafood', emoji: '🦐', aliases: ['shrimp', 'prawns', 'crab', 'lobster', 'scallops', 'mussels', 'clams', 'imitation crab', 'frozen shrimp'], keywords: ['shrimp', 'prawn', 'crab', 'lobster', 'scallop', 'mussel', 'clam'] },
  { key: 'dairy-milk', emoji: '🥛', aliases: ['milk', 'whole milk', 'low fat milk', 'skim milk', 'lactose free milk', 'almond milk', 'oat milk', 'soy milk', 'coconut milk beverage', 'evaporated milk', 'condensed milk', 'chocolate milk'], keywords: ['milk'] },
  { key: 'dairy-yogurt', emoji: '🥣', aliases: ['yogurt', 'greek yogurt', 'plain yogurt', 'flavored yogurt', 'labneh', 'frozen yogurt', 'yogurt pouches'], keywords: ['yogurt', 'labneh'] },
  { key: 'dairy-cheese', emoji: '🧀', aliases: ['cheese', 'cream cheese', 'cottage cheese', 'ricotta', 'mozzarella', 'shredded mozzarella', 'cheddar cheese', 'shredded cheddar', 'american cheese', 'swiss cheese', 'provolone', 'parmesan', 'feta', 'goat cheese', 'blue cheese', 'brie'], keywords: ['cheese', 'mozzarella', 'cheddar', 'swiss', 'provolone', 'parmesan', 'feta', 'brie', 'ricotta'] },
  { key: 'dairy-butter-cream', emoji: '🧈', aliases: ['butter', 'salted butter', 'unsalted butter', 'ghee', 'cream', 'sour cream', 'heavy cream', 'half and half', 'whipped cream', 'coffee creamer'], keywords: ['butter', 'ghee', 'cream', 'creamer'] },
  { key: 'bakery-bread', emoji: '🍞', aliases: ['bread', 'white bread', 'wheat bread', 'whole grain bread', 'sourdough bread', 'rye bread', 'pita bread', 'naan', 'tortillas', 'flour tortillas', 'corn tortillas', 'dinner rolls', 'hamburger buns', 'hot dog buns', 'brioche', 'lavash', 'flatbread', 'frozen naan', 'frozen paratha'], keywords: ['bread', 'pita', 'naan', 'tortilla', 'rolls', 'buns', 'brioche', 'lavash', 'flatbread', 'paratha'] },
  { key: 'bakery-breakfast', emoji: '🥯', aliases: ['bagels', 'english muffins', 'croissants', 'pancakes', 'waffles', 'french toast', 'muffins', 'donuts', 'frozen waffles'], keywords: ['bagel', 'muffin', 'croissant', 'pancake', 'waffle', 'donut', 'french toast'] },
  { key: 'breakfast-cereal', emoji: '🥣', aliases: ['cereal', 'oats', 'oatmeal', 'rolled oats', 'steel cut oats', 'granola', 'breakfast bars', 'granola bars'], keywords: ['cereal', 'oat', 'granola'] },
  { key: 'grain-rice', emoji: '🍚', aliases: ['rice', 'basmati rice', 'jasmine rice', 'brown rice', 'white rice', 'sushi rice', 'parboiled rice', 'wild rice', 'rice cakes', 'rice noodles'], keywords: ['rice'] },
  { key: 'grain-pasta', emoji: '🍝', aliases: ['pasta', 'spaghetti', 'linguine', 'fettuccine', 'penne', 'rotini', 'macaroni', 'lasagna noodles', 'ramen noodles', 'udon noodles', 'soba noodles', 'egg noodles'], keywords: ['pasta', 'spaghetti', 'linguine', 'fettuccine', 'penne', 'rotini', 'macaroni', 'lasagna', 'ramen', 'udon', 'soba', 'noodles'] },
  { key: 'grain-flour', emoji: '🌾', aliases: ['flour', 'all purpose flour', 'bread flour', 'whole wheat flour', 'almond flour', 'coconut flour', 'chickpea flour', 'semolina', 'cornmeal'], keywords: ['flour', 'semolina', 'cornmeal'] },
  { key: 'grain-whole', emoji: '🌾', aliases: ['quinoa', 'couscous', 'bulgur', 'barley', 'farro', 'millet'], keywords: ['quinoa', 'couscous', 'bulgur', 'barley', 'farro', 'millet'] },
  { key: 'legume-beans', emoji: '🫘', aliases: ['lentils', 'red lentils', 'green lentils', 'brown lentils', 'black lentils', 'chickpeas', 'garbanzo beans', 'black beans', 'kidney beans', 'pinto beans', 'navy beans', 'cannellini beans', 'lima beans', 'split peas', 'mung beans', 'fava beans', 'black eyed peas', 'soybeans', 'dry beans', 'canned beans', 'canned chickpeas'], keywords: ['lentil', 'beans', 'bean', 'chickpea', 'garbanzo', 'peas', 'mung', 'fava', 'soybean'] },
  { key: 'condiment-bottle', emoji: '🫙', aliases: ['pasta sauce', 'marinara sauce', 'alfredo sauce', 'pesto', 'salsa', 'ketchup', 'mustard', 'mayonnaise', 'hot sauce', 'sriracha', 'barbecue sauce', 'soy sauce', 'teriyaki sauce', 'oyster sauce', 'fish sauce', 'hoisin sauce', 'worcestershire sauce', 'vinegar', 'white vinegar', 'apple cider vinegar', 'balsamic vinegar', 'rice vinegar', 'hummus', 'olives', 'capers'], keywords: ['sauce', 'ketchup', 'mustard', 'mayonnaise', 'sriracha', 'vinegar', 'pesto', 'salsa', 'hummus', 'olives', 'capers'] },
  { key: 'oil-bottle', emoji: '🫒', aliases: ['olive oil', 'vegetable oil', 'canola oil', 'avocado oil', 'coconut oil', 'sesame oil', 'cooking spray'], keywords: ['oil', 'cooking spray'] },
  { key: 'sweet-spread', emoji: '🍯', aliases: ['honey', 'maple syrup', 'jam', 'jelly', 'peanut butter', 'almond butter', 'tahini'], keywords: ['honey', 'syrup', 'jam', 'jelly', 'peanut butter', 'almond butter', 'tahini'] },
  { key: 'soup-broth', emoji: '🥫', aliases: ['canned soup', 'chicken broth', 'beef broth', 'vegetable broth', 'bone broth'], keywords: ['soup', 'broth'] },
  { key: 'spice-jar', emoji: '🧂', aliases: ['salt', 'sea salt', 'pepper', 'black pepper', 'white pepper', 'red pepper flakes', 'paprika', 'smoked paprika', 'cumin', 'coriander powder', 'turmeric powder', 'curry powder', 'garam masala', 'chili powder', 'cayenne pepper', 'cinnamon', 'cinnamon sticks', 'nutmeg', 'cloves', 'cardamom', 'cardamom pods', 'star anise', 'fennel seeds', 'mustard seeds', 'cumin seeds', 'coriander seeds', 'sesame seeds', 'poppy seeds', 'caraway seeds'], keywords: ['salt', 'pepper', 'paprika', 'cumin', 'coriander', 'turmeric', 'curry', 'masala', 'chili powder', 'cayenne', 'cinnamon', 'nutmeg', 'cloves', 'cardamom', 'anise', 'seeds'] },
  { key: 'baking', emoji: '🧁', aliases: ['vanilla extract', 'baking powder', 'baking soda', 'yeast', 'sugar', 'brown sugar', 'powdered sugar', 'cocoa powder', 'chocolate chips', 'baking chocolate', 'sprinkles', 'gelatin', 'cornstarch', 'breadcrumbs', 'panko'], keywords: ['vanilla', 'baking', 'yeast', 'sugar', 'cocoa', 'chocolate chips', 'sprinkles', 'gelatin', 'cornstarch', 'breadcrumbs', 'panko'] },
  { key: 'coffee-tea', emoji: '☕', aliases: ['coffee', 'ground coffee', 'coffee beans', 'instant coffee', 'tea', 'black tea', 'green tea', 'herbal tea', 'iced tea'], keywords: ['coffee', 'tea'] },
  { key: 'frozen', emoji: '🧊', aliases: ['frozen pizza', 'frozen meals', 'frozen dumplings', 'frozen samosas', 'frozen burgers', 'frozen meatballs', 'frozen burritos'], keywords: ['frozen'] },
  { key: 'frozen-dessert', emoji: '🍦', aliases: ['ice cream', 'popsicles'], keywords: ['ice cream', 'popsicle'] },
  { key: 'drink-bottle', emoji: '🧃', aliases: ['water bottles', 'sparkling water', 'mineral water', 'soda', 'cola', 'juice', 'apple juice', 'cranberry juice', 'sports drink', 'energy drink', 'coconut water', 'kombucha', 'protein shake', 'meal replacement shake', 'kids juice boxes'], keywords: ['water', 'soda', 'cola', 'juice', 'drink', 'kombucha', 'shake'] },
  { key: 'snack', emoji: '🍿', aliases: ['protein bars', 'cookies', 'crackers', 'graham crackers', 'popcorn', 'pretzels', 'chips', 'tortilla chips', 'trail mix', 'fruit snacks', 'snack packs', 'protein cookies'], keywords: ['bar', 'cookie', 'cracker', 'popcorn', 'pretzel', 'chips', 'snack'] },
  { key: 'nuts-seeds', emoji: '🥜', aliases: ['nuts', 'almonds', 'walnuts', 'pistachios', 'cashews', 'peanuts', 'mixed nuts', 'sunflower seeds', 'pumpkin seeds'], keywords: ['nuts', 'almond', 'walnut', 'pistachio', 'cashew', 'peanut', 'sunflower seeds', 'pumpkin seeds'] },
  { key: 'sweet', emoji: '🍫', aliases: ['chocolate', 'dark chocolate', 'milk chocolate', 'candy', 'gum', 'mints', 'marshmallows', 'pudding', 'jello'], keywords: ['chocolate', 'candy', 'gum', 'mints', 'marshmallow', 'pudding', 'jello'] },
  { key: 'household-paper', emoji: '🧻', aliases: ['toilet paper', 'paper towels', 'tissues', 'napkins', 'paper plates', 'paper bowls', 'parchment paper', 'wax paper'], keywords: ['toilet paper', 'paper towel', 'tissues', 'napkins', 'paper plates', 'paper bowls', 'parchment', 'wax paper'] },
  { key: 'household-disposable', emoji: '🥤', aliases: ['plastic cups', 'disposable cups', 'plastic forks', 'plastic spoons', 'plastic knives', 'aluminum foil', 'plastic wrap', 'freezer bags', 'sandwich bags'], keywords: ['plastic', 'disposable', 'foil', 'wrap', 'bags'] },
  { key: 'household-trash', emoji: '🗑️', aliases: ['trash bags', 'kitchen trash bags', 'contractor bags'], keywords: ['trash bag', 'contractor bag'] },
  { key: 'household-cleaner', emoji: '🧽', aliases: ['dish soap', 'sponges', 'scrub pads', 'cleaning spray', 'all purpose cleaner', 'glass cleaner', 'disinfecting wipes', 'bleach', 'toilet cleaner', 'bathroom cleaner', 'shower cleaner', 'floor cleaner', 'mop heads', 'broom', 'dustpan', 'dusters'], keywords: ['soap', 'sponge', 'scrub', 'cleaner', 'cleaning', 'wipes', 'bleach', 'mop', 'broom', 'dust'] },
  { key: 'household-detergent', emoji: '🧴', aliases: ['dishwasher detergent', 'dishwasher pods', 'rinse aid', 'laundry detergent', 'laundry pods', 'fabric softener', 'dryer sheets', 'stain remover', 'oxygen cleaner'], keywords: ['detergent', 'pods', 'rinse aid', 'softener', 'dryer sheets', 'stain remover', 'oxygen cleaner'] },
  { key: 'household-general', emoji: '🕯️', aliases: ['air freshener', 'candles', 'batteries', 'light bulbs', 'extension cord'], keywords: ['freshener', 'candle', 'batteries', 'battery', 'light bulb', 'extension cord'] },
  { key: 'personal-care', emoji: '🧴', aliases: ['shampoo', 'conditioner', 'body wash', 'bar soap', 'hand soap', 'lotion', 'face wash', 'toothpaste', 'toothbrush', 'mouthwash', 'floss', 'deodorant', 'razors', 'shaving cream', 'cotton swabs', 'cotton balls', 'sunscreen', 'lip balm', 'hand sanitizer'], keywords: ['shampoo', 'conditioner', 'body wash', 'soap', 'lotion', 'tooth', 'mouthwash', 'floss', 'deodorant', 'razor', 'shaving', 'cotton', 'sunscreen', 'lip balm', 'sanitizer'] },
  { key: 'pharmacy', emoji: '💊', aliases: ['bandages', 'antiseptic', 'rubbing alcohol', 'hydrogen peroxide', 'pain reliever', 'ibuprofen', 'acetaminophen', 'allergy medicine', 'cough syrup', 'cold medicine', 'vitamins'], keywords: ['bandage', 'antiseptic', 'rubbing alcohol', 'hydrogen peroxide', 'medicine', 'ibuprofen', 'acetaminophen', 'vitamin', 'cough syrup', 'pain reliever'] },
  { key: 'baby', emoji: '🍼', aliases: ['diapers', 'baby wipes', 'baby formula', 'baby food', 'diaper cream'], keywords: ['diaper', 'baby'] },
  { key: 'pet', emoji: '🐾', aliases: ['pet food', 'dog food', 'cat food', 'cat litter', 'pet treats'], keywords: ['pet', 'dog food', 'cat food', 'cat litter'] },
];

const EXACT_ICON_BY_NAME = new Map<string, ItemIconGroup>();

for (const group of ICON_GROUPS) {
  for (const alias of group.aliases) {
    EXACT_ICON_BY_NAME.set(normalizeItemKey(alias), group);
  }
}

export function normalizeItemKey(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function singularize(key: string): string {
  return key
    .replace(/\bberries\b/g, 'berry')
    .replace(/\btomatoes\b/g, 'tomato')
    .replace(/\bpotatoes\b/g, 'potato')
    .replace(/\bmangoes\b/g, 'mango')
    .replace(/\bcherries\b/g, 'cherry')
    .replace(/\b([^ ]{4,})s\b/g, '$1');
}

function fallbackFor(category?: string | null): string {
  if (category === 'freezer') return CATEGORY_FALLBACK_EMOJI.freezer;
  if (category === 'fridge') return CATEGORY_FALLBACK_EMOJI.fridge;
  if (category === 'pantry') return CATEGORY_FALLBACK_EMOJI.pantry;
  return CATEGORY_FALLBACK_EMOJI.other;
}

export function resolveItemIcon(name: unknown, category?: string | null): ItemIconResolution {
  const key = normalizeItemKey(name);
  if (!key) return { emoji: fallbackFor(category), matched: false };

  const exact = EXACT_ICON_BY_NAME.get(key) ?? EXACT_ICON_BY_NAME.get(singularize(key));
  if (exact) return { emoji: exact.emoji, matched: true, itemType: exact.key };

  const keyword = ICON_GROUPS.find((group) =>
    (group.keywords ?? group.aliases).some((term) => {
      const normalizedTerm = normalizeItemKey(term);
      return normalizedTerm.length > 2 && key.includes(normalizedTerm);
    }),
  );
  if (keyword) return { emoji: keyword.emoji, matched: true, itemType: keyword.key };

  return { emoji: fallbackFor(category), matched: false };
}

export function getItemEmoji(name: unknown, category?: string | null): string {
  return resolveItemIcon(name, category).emoji;
}
