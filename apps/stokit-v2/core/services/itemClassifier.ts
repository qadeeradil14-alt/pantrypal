/**
 * Stokit V2 — item classifier.
 *
 * Maps a free-text pantry item name to an emoji icon + category.
 * Pure function, no API, instant. Call on every render — cost is negligible.
 *
 * Coverage: 250+ keywords across every household category.
 */

export type ItemCategory =
  | 'produce_fruit'
  | 'produce_veg'
  | 'meat'
  | 'seafood'
  | 'dairy'
  | 'eggs'
  | 'bread'
  | 'grains'
  | 'pasta'
  | 'canned'
  | 'condiment'
  | 'sauce'
  | 'oil'
  | 'snack'
  | 'sweet'
  | 'beverage'
  | 'coffee_tea'
  | 'alcohol'
  | 'frozen'
  | 'baking'
  | 'spice'
  | 'cleaning'
  | 'laundry'
  | 'paper'
  | 'personal_care'
  | 'medicine'
  | 'baby'
  | 'pet'
  | 'household'
  | 'other';

import type { StorageLocation } from '../../types';

export interface ItemClassification {
  emoji: string;
  category: ItemCategory;
  /** Accent color for the icon background chip. */
  color: string;
  /** Where the item lives at home — used to group in "Everything else". */
  storageLocation: StorageLocation;
}

/** Map category → storage location. */
const CATEGORY_LOCATION: Record<ItemCategory, StorageLocation> = {
  produce_fruit: 'fridge',
  produce_veg:   'fridge',
  meat:          'fridge',
  seafood:       'fridge',
  dairy:         'fridge',
  eggs:          'fridge',
  bread:         'pantry',
  grains:        'pantry',
  pasta:         'pantry',
  canned:        'pantry',
  condiment:     'pantry',
  sauce:         'pantry',
  oil:           'pantry',
  snack:         'pantry',
  sweet:         'pantry',
  beverage:      'beverages',
  coffee_tea:    'beverages',
  alcohol:       'beverages',
  frozen:        'freezer',
  baking:        'pantry',
  spice:         'pantry',
  cleaning:      'pantry',
  laundry:       'pantry',
  paper:         'pantry',
  personal_care: 'pantry',
  medicine:      'pantry',
  baby:          'pantry',
  pet:           'pantry',
  household:     'pantry',
  other:         'pantry',
};

interface Rule {
  keywords: string[];
  emoji: string;
  category: ItemCategory;
  color: string;
}

// Rules are checked in order — first match wins. Put specific rules before generic ones.
const RULES: Rule[] = [
  // ── PRODUCE: FRUIT ────────────────────────────────────────────────────────
  { keywords: ['apple', 'apples', 'gala', 'fuji', 'granny smith', 'honeycrisp'], emoji: '🍎', category: 'produce_fruit', color: '#B03A2E' },
  { keywords: ['banana', 'bananas', 'plantain'], emoji: '🍌', category: 'produce_fruit', color: '#D4AC0D' },
  { keywords: ['orange', 'oranges', 'mandarin', 'clementine', 'tangerine'], emoji: '🍊', category: 'produce_fruit', color: '#D35400' },
  { keywords: ['lemon', 'lemons'], emoji: '🍋', category: 'produce_fruit', color: '#F4D03F' },
  { keywords: ['lime', 'limes'], emoji: '🍋', category: 'produce_fruit', color: '#1E8449' },
  { keywords: ['grape', 'grapes'], emoji: '🍇', category: 'produce_fruit', color: '#6C3483' },
  { keywords: ['strawberry', 'strawberries'], emoji: '🍓', category: 'produce_fruit', color: '#C0392B' },
  { keywords: ['blueberry', 'blueberries'], emoji: '🫐', category: 'produce_fruit', color: '#2471A3' },
  { keywords: ['raspberry', 'raspberries'], emoji: '🍓', category: 'produce_fruit', color: '#C0392B' },
  { keywords: ['blackberry', 'blackberries'], emoji: '🫐', category: 'produce_fruit', color: '#5B2C6F' },
  { keywords: ['peach', 'peaches', 'nectarine'], emoji: '🍑', category: 'produce_fruit', color: '#F0A500' },
  { keywords: ['pear', 'pears'], emoji: '🍐', category: 'produce_fruit', color: '#A9B84C' },
  { keywords: ['cherry', 'cherries'], emoji: '🍒', category: 'produce_fruit', color: '#A93226' },
  { keywords: ['watermelon'], emoji: '🍉', category: 'produce_fruit', color: '#1D8348' },
  { keywords: ['pineapple'], emoji: '🍍', category: 'produce_fruit', color: '#D4AC0D' },
  { keywords: ['mango', 'mangoes', 'mangos'], emoji: '🥭', category: 'produce_fruit', color: '#F39C12' },
  { keywords: ['coconut'], emoji: '🥥', category: 'produce_fruit', color: '#7D6608' },
  { keywords: ['kiwi', 'kiwis'], emoji: '🥝', category: 'produce_fruit', color: '#1E8449' },
  { keywords: ['melon', 'cantaloupe', 'honeydew'], emoji: '🍈', category: 'produce_fruit', color: '#7DCEA0' },
  { keywords: ['fig', 'figs'], emoji: '🍇', category: 'produce_fruit', color: '#6C3483' },
  { keywords: ['plum', 'plums', 'prune', 'prunes'], emoji: '🍑', category: 'produce_fruit', color: '#7D3C98' },
  { keywords: ['pomegranate'], emoji: '🍎', category: 'produce_fruit', color: '#A93226' },
  { keywords: ['papaya'], emoji: '🥭', category: 'produce_fruit', color: '#F39C12' },
  { keywords: ['passion fruit', 'passionfruit'], emoji: '🍇', category: 'produce_fruit', color: '#7D3C98' },
  { keywords: ['grapefruit'], emoji: '🍊', category: 'produce_fruit', color: '#E74C3C' },
  { keywords: ['apricot', 'apricots'], emoji: '🍑', category: 'produce_fruit', color: '#F39C12' },
  { keywords: ['date', 'dates', 'medjool'], emoji: '🫚', category: 'produce_fruit', color: '#7D6608' },
  { keywords: ['lychee', 'lychees'], emoji: '🍡', category: 'produce_fruit', color: '#F1948A' },

  // ── PRODUCE: VEGETABLES ────────────────────────────────────────────────────
  { keywords: ['avocado', 'avocados'], emoji: '🥑', category: 'produce_veg', color: '#1E8449' },
  { keywords: ['tomato', 'tomatoes', 'cherry tomato', 'roma'], emoji: '🍅', category: 'produce_veg', color: '#C0392B' },
  { keywords: ['potato', 'potatoes', 'russet', 'yukon'], emoji: '🥔', category: 'produce_veg', color: '#D4AC0D' },
  { keywords: ['sweet potato', 'yam', 'yams'], emoji: '🍠', category: 'produce_veg', color: '#E67E22' },
  { keywords: ['carrot', 'carrots', 'baby carrots'], emoji: '🥕', category: 'produce_veg', color: '#E67E22' },
  { keywords: ['broccoli'], emoji: '🥦', category: 'produce_veg', color: '#1E8449' },
  { keywords: ['cauliflower'], emoji: '🥦', category: 'produce_veg', color: '#F4F6F7' },
  { keywords: ['lettuce', 'romaine', 'iceberg', 'butter lettuce'], emoji: '🥬', category: 'produce_veg', color: '#27AE60' },
  { keywords: ['spinach', 'baby spinach'], emoji: '🥬', category: 'produce_veg', color: '#1E8449' },
  { keywords: ['kale', 'arugula', 'chard', 'collard'], emoji: '🥬', category: 'produce_veg', color: '#145A32' },
  { keywords: ['cabbage', 'napa cabbage', 'bok choy'], emoji: '🥬', category: 'produce_veg', color: '#27AE60' },
  { keywords: ['cucumber', 'cucumbers'], emoji: '🥒', category: 'produce_veg', color: '#1E8449' },
  { keywords: ['zucchini', 'courgette'], emoji: '🥒', category: 'produce_veg', color: '#27AE60' },
  { keywords: ['onion', 'onions', 'yellow onion', 'white onion', 'red onion'], emoji: '🧅', category: 'produce_veg', color: '#A04000' },
  { keywords: ['garlic', 'garlic cloves', 'garlic bulb'], emoji: '🧄', category: 'produce_veg', color: '#F0E6D3' },
  { keywords: ['corn', 'sweet corn', 'corn on the cob'], emoji: '🌽', category: 'produce_veg', color: '#F4D03F' },
  { keywords: ['mushroom', 'mushrooms', 'portobello', 'shiitake', 'cremini'], emoji: '🍄', category: 'produce_veg', color: '#7B7B7B' },
  { keywords: ['bell pepper', 'pepper', 'peppers', 'capsicum'], emoji: '🫑', category: 'produce_veg', color: '#1E8449' },
  { keywords: ['jalapeño', 'jalapeño', 'chili', 'habanero', 'serrano'], emoji: '🌶️', category: 'produce_veg', color: '#C0392B' },
  { keywords: ['eggplant', 'aubergine'], emoji: '🍆', category: 'produce_veg', color: '#6C3483' },
  { keywords: ['squash', 'butternut squash', 'acorn squash'], emoji: '🎃', category: 'produce_veg', color: '#E67E22' },
  { keywords: ['pumpkin'], emoji: '🎃', category: 'produce_veg', color: '#E67E22' },
  { keywords: ['celery'], emoji: '🥬', category: 'produce_veg', color: '#27AE60' },
  { keywords: ['asparagus'], emoji: '🥦', category: 'produce_veg', color: '#1E8449' },
  { keywords: ['brussels sprouts', 'brussels'], emoji: '🥦', category: 'produce_veg', color: '#1E8449' },
  { keywords: ['artichoke'], emoji: '🥦', category: 'produce_veg', color: '#27AE60' },
  { keywords: ['beet', 'beets', 'beetroot'], emoji: '🩸', category: 'produce_veg', color: '#943126' },
  { keywords: ['radish', 'radishes'], emoji: '🥕', category: 'produce_veg', color: '#E74C3C' },
  { keywords: ['turnip', 'turnips', 'parsnip', 'parsnips'], emoji: '🥕', category: 'produce_veg', color: '#E8DAEF' },
  { keywords: ['leek', 'leeks', 'scallion', 'scallions', 'green onion', 'shallot'], emoji: '🧅', category: 'produce_veg', color: '#27AE60' },
  { keywords: ['pea', 'peas', 'snow peas', 'sugar snap'], emoji: '🫛', category: 'produce_veg', color: '#27AE60' },
  { keywords: ['edamame'], emoji: '🫛', category: 'produce_veg', color: '#1E8449' },
  { keywords: ['ginger', 'ginger root'], emoji: '🫚', category: 'produce_veg', color: '#D4AC0D' },
  { keywords: ['basil', 'cilantro', 'parsley', 'mint', 'dill', 'rosemary', 'thyme', 'oregano', 'sage', 'chives', 'herb', 'herbs', 'fresh herbs'], emoji: '🌿', category: 'produce_veg', color: '#1E8449' },

  // ── MEAT & POULTRY ─────────────────────────────────────────────────────────
  { keywords: ['bacon', 'turkey bacon', 'pancetta'], emoji: '🥓', category: 'meat', color: '#C0392B' },
  { keywords: ['sausage', 'bratwurst', 'chorizo', 'kielbasa', 'italian sausage'], emoji: '🌭', category: 'meat', color: '#A04000' },
  { keywords: ['hot dog', 'hotdog', 'frankfurter'], emoji: '🌭', category: 'meat', color: '#C0392B' },
  { keywords: ['chicken', 'chicken breast', 'chicken thigh', 'chicken wing', 'rotisserie'], emoji: '🍗', category: 'meat', color: '#F0A500' },
  { keywords: ['turkey', 'ground turkey', 'turkey breast'], emoji: '🦃', category: 'meat', color: '#A04000' },
  { keywords: ['duck', 'duck breast'], emoji: '🍗', category: 'meat', color: '#A04000' },
  { keywords: ['beef', 'ground beef', 'steak', 'ribeye', 'sirloin', 'brisket', 'chuck', 'round'], emoji: '🥩', category: 'meat', color: '#922B21' },
  { keywords: ['pork', 'pork chop', 'pork loin', 'pork tenderloin', 'ribs'], emoji: '🥩', category: 'meat', color: '#CB4335' },
  { keywords: ['lamb', 'lamb chop', 'rack of lamb'], emoji: '🥩', category: 'meat', color: '#922B21' },
  { keywords: ['ham', 'prosciutto', 'deli ham'], emoji: '🥩', category: 'meat', color: '#CB4335' },
  { keywords: ['salami', 'pepperoni', 'deli meat', 'lunch meat', 'cold cuts'], emoji: '🥩', category: 'meat', color: '#922B21' },
  { keywords: ['veal', 'venison', 'bison', 'elk', 'wild boar'], emoji: '🥩', category: 'meat', color: '#922B21' },

  // ── SEAFOOD ────────────────────────────────────────────────────────────────
  { keywords: ['salmon', 'atlantic salmon', 'sockeye'], emoji: '🐟', category: 'seafood', color: '#E74C3C' },
  { keywords: ['tuna', 'ahi tuna', 'yellowfin'], emoji: '🐟', category: 'seafood', color: '#2E86C1' },
  { keywords: ['shrimp', 'prawns'], emoji: '🦐', category: 'seafood', color: '#E74C3C' },
  { keywords: ['lobster'], emoji: '🦞', category: 'seafood', color: '#C0392B' },
  { keywords: ['crab', 'dungeness', 'king crab'], emoji: '🦀', category: 'seafood', color: '#E74C3C' },
  { keywords: ['oyster', 'oysters'], emoji: '🦪', category: 'seafood', color: '#839192' },
  { keywords: ['clam', 'clams', 'mussel', 'mussels'], emoji: '🦪', category: 'seafood', color: '#839192' },
  { keywords: ['scallop', 'scallops'], emoji: '🦐', category: 'seafood', color: '#F0E6D3' },
  { keywords: ['halibut', 'cod', 'tilapia', 'mahi', 'bass', 'flounder', 'haddock', 'catfish', 'pollock', 'snapper', 'trout', 'swordfish'], emoji: '🐟', category: 'seafood', color: '#2E86C1' },
  { keywords: ['sardine', 'sardines', 'anchovy', 'anchovies', 'herring'], emoji: '🐟', category: 'seafood', color: '#1A5276' },

  // ── DAIRY ─────────────────────────────────────────────────────────────────
  { keywords: ['milk', 'whole milk', 'skim milk', '2% milk', 'oat milk', 'almond milk', 'soy milk', 'coconut milk beverage'], emoji: '🥛', category: 'dairy', color: '#F4F6F7' },
  { keywords: ['cream', 'heavy cream', 'half and half', 'whipping cream'], emoji: '🥛', category: 'dairy', color: '#FDFEFE' },
  { keywords: ['butter', 'unsalted butter', 'salted butter', 'margarine', 'ghee'], emoji: '🧈', category: 'dairy', color: '#F4D03F' },
  { keywords: ['cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'gouda', 'brie', 'swiss', 'provolone', 'monterey jack', 'colby', 'ricotta', 'gruyere', 'gorgonzola', 'blue cheese', 'american cheese', 'pepper jack'], emoji: '🧀', category: 'dairy', color: '#F0A500' },
  { keywords: ['cream cheese', 'cottage cheese', 'mascarpone'], emoji: '🧀', category: 'dairy', color: '#FDFEFE' },
  { keywords: ['yogurt', 'greek yogurt', 'plain yogurt', 'kefir'], emoji: '🍶', category: 'dairy', color: '#F4F6F7' },
  { keywords: ['sour cream', 'crème fraîche'], emoji: '🥛', category: 'dairy', color: '#FDFEFE' },
  { keywords: ['ice cream', 'gelato', 'sorbet', 'frozen yogurt', 'frozen custard'], emoji: '🍦', category: 'dairy', color: '#F9E4B7' },
  { keywords: ['whipped cream', 'cool whip', 'whipped topping'], emoji: '🥛', category: 'dairy', color: '#FDFEFE' },

  // ── EGGS ──────────────────────────────────────────────────────────────────
  { keywords: ['egg', 'eggs', 'dozen eggs', 'free range', 'egg whites', 'quail egg'], emoji: '🥚', category: 'eggs', color: '#F4D03F' },

  // ── BREAD & BAKERY ─────────────────────────────────────────────────────────
  { keywords: ['bread', 'white bread', 'wheat bread', 'whole wheat', 'sourdough', 'multigrain', 'rye bread', 'brioche'], emoji: '🍞', category: 'bread', color: '#D4AC0D' },
  { keywords: ['bagel', 'bagels'], emoji: '🥯', category: 'bread', color: '#D4AC0D' },
  { keywords: ['muffin', 'muffins', 'english muffin'], emoji: '🧁', category: 'bread', color: '#D4AC0D' },
  { keywords: ['croissant', 'croissants'], emoji: '🥐', category: 'bread', color: '#D4AC0D' },
  { keywords: ['baguette', 'french bread'], emoji: '🥖', category: 'bread', color: '#D4AC0D' },
  { keywords: ['tortilla', 'tortillas', 'flour tortilla', 'corn tortilla', 'wrap', 'wraps'], emoji: '🌮', category: 'bread', color: '#F0E6D3' },
  { keywords: ['pita', 'pita bread', 'naan', 'flatbread', 'lavash'], emoji: '🫓', category: 'bread', color: '#F0E6D3' },
  { keywords: ['cake', 'birthday cake'], emoji: '🎂', category: 'bread', color: '#F1948A' },
  { keywords: ['pie', 'apple pie', 'pumpkin pie'], emoji: '🥧', category: 'bread', color: '#D4AC0D' },
  { keywords: ['cookie', 'cookies', 'chocolate chip cookie'], emoji: '🍪', category: 'bread', color: '#A04000' },
  { keywords: ['brownie', 'brownies'], emoji: '🍫', category: 'bread', color: '#5D4037' },
  { keywords: ['donut', 'donuts', 'doughnut'], emoji: '🍩', category: 'bread', color: '#D4AC0D' },
  { keywords: ['pancake', 'pancakes', 'waffle', 'waffles'], emoji: '🥞', category: 'bread', color: '#D4AC0D' },
  { keywords: ['pretzel', 'pretzels', 'soft pretzel'], emoji: '🥨', category: 'bread', color: '#D4AC0D' },
  { keywords: ['roll', 'rolls', 'dinner roll', 'hamburger bun', 'hot dog bun'], emoji: '🍞', category: 'bread', color: '#D4AC0D' },

  // ── GRAINS & CEREALS ──────────────────────────────────────────────────────
  { keywords: ['cereal', 'corn flakes', 'granola cereal', 'bran flakes', 'cheerios', 'frosted flakes'], emoji: '🥣', category: 'grains', color: '#F4D03F' },
  { keywords: ['oats', 'oatmeal', 'rolled oats', 'steel cut oats', 'instant oats'], emoji: '🥣', category: 'grains', color: '#D4AC0D' },
  { keywords: ['granola', 'granola bar', 'muesli'], emoji: '🥣', category: 'grains', color: '#A04000' },
  { keywords: ['rice', 'white rice', 'brown rice', 'jasmine rice', 'basmati', 'wild rice', 'arborio'], emoji: '🍚', category: 'grains', color: '#F4F6F7' },
  { keywords: ['quinoa'], emoji: '🌾', category: 'grains', color: '#D4AC0D' },
  { keywords: ['flour', 'all purpose flour', 'bread flour', 'cake flour', 'almond flour', 'coconut flour'], emoji: '🌾', category: 'baking', color: '#F4F6F7' },
  { keywords: ['cornmeal', 'grits', 'polenta'], emoji: '🌾', category: 'grains', color: '#F4D03F' },
  { keywords: ['barley', 'farro', 'wheat berries', 'spelt', 'bulgur', 'couscous'], emoji: '🌾', category: 'grains', color: '#D4AC0D' },

  // ── PASTA & NOODLES ───────────────────────────────────────────────────────
  { keywords: ['pasta', 'penne', 'rigatoni', 'fusilli', 'farfalle', 'orzo', 'lasagna noodles', 'macaroni'], emoji: '🍝', category: 'pasta', color: '#F4D03F' },
  { keywords: ['spaghetti', 'linguine', 'fettuccine', 'angel hair', 'bucatini'], emoji: '🍝', category: 'pasta', color: '#F4D03F' },
  { keywords: ['ramen', 'noodles', 'udon', 'soba', 'rice noodles', 'glass noodles'], emoji: '🍜', category: 'pasta', color: '#F4D03F' },

  // ── CANNED & JARRED ───────────────────────────────────────────────────────
  { keywords: ['canned tomatoes', 'diced tomatoes', 'crushed tomatoes', 'tomato paste', 'tomato puree'], emoji: '🥫', category: 'canned', color: '#C0392B' },
  { keywords: ['canned beans', 'canned chickpeas', 'canned lentils', 'canned peas', 'black beans', 'kidney beans', 'cannellini', 'pinto beans'], emoji: '🫘', category: 'canned', color: '#784212' },
  { keywords: ['canned tuna', 'canned salmon', 'canned sardines', 'canned anchovies'], emoji: '🥫', category: 'canned', color: '#1A5276' },
  { keywords: ['coconut milk', 'coconut cream'], emoji: '🥛', category: 'canned', color: '#F4F6F7' },
  { keywords: ['soup', 'chicken soup', 'tomato soup', 'clam chowder', 'minestrone'], emoji: '🍲', category: 'canned', color: '#E67E22' },
  { keywords: ['broth', 'stock', 'chicken broth', 'beef broth', 'vegetable broth'], emoji: '🍲', category: 'canned', color: '#D4AC0D' },
  { keywords: ['olive', 'olives', 'kalamata'], emoji: '🫒', category: 'canned', color: '#145A32' },
  { keywords: ['pickle', 'pickles', 'gherkin', 'cornichon'], emoji: '🥒', category: 'canned', color: '#1E8449' },
  { keywords: ['sauerkraut', 'kimchi'], emoji: '🥬', category: 'canned', color: '#27AE60' },

  // ── CONDIMENTS & SAUCES ───────────────────────────────────────────────────
  { keywords: ['ketchup', 'catsup'], emoji: '🍅', category: 'condiment', color: '#C0392B' },
  { keywords: ['mustard', 'dijon', 'yellow mustard', 'whole grain mustard'], emoji: '🌭', category: 'condiment', color: '#F4D03F' },
  { keywords: ['mayo', 'mayonnaise', 'miracle whip'], emoji: '🫙', category: 'condiment', color: '#F4F6F7' },
  { keywords: ['hot sauce', 'sriracha', 'tabasco', 'frank\'s', 'cholula'], emoji: '🌶️', category: 'condiment', color: '#C0392B' },
  { keywords: ['salsa'], emoji: '🫙', category: 'condiment', color: '#C0392B' },
  { keywords: ['hummus'], emoji: '🫙', category: 'condiment', color: '#D4AC0D' },
  { keywords: ['guacamole'], emoji: '🥑', category: 'condiment', color: '#1E8449' },
  { keywords: ['ranch', 'ranch dressing'], emoji: '🫙', category: 'condiment', color: '#F4F6F7' },
  { keywords: ['bbq sauce', 'barbecue sauce'], emoji: '🫙', category: 'condiment', color: '#922B21' },
  { keywords: ['soy sauce', 'tamari', 'liquid aminos'], emoji: '🫙', category: 'condiment', color: '#1A1A1A' },
  { keywords: ['worcestershire'], emoji: '🫙', category: 'condiment', color: '#5D4037' },
  { keywords: ['teriyaki sauce'], emoji: '🫙', category: 'condiment', color: '#5D4037' },
  { keywords: ['hoisin', 'oyster sauce', 'fish sauce', 'miso'], emoji: '🫙', category: 'condiment', color: '#5D4037' },
  { keywords: ['tomato sauce', 'marinara', 'pasta sauce', 'arrabiata'], emoji: '🍅', category: 'sauce', color: '#C0392B' },
  { keywords: ['pesto'], emoji: '🌿', category: 'sauce', color: '#1E8449' },
  { keywords: ['alfredo sauce'], emoji: '🫙', category: 'sauce', color: '#F4F6F7' },
  { keywords: ['salad dressing', 'vinaigrette', 'italian dressing', 'balsamic'], emoji: '🫙', category: 'condiment', color: '#7D6608' },
  { keywords: ['peanut butter', 'almond butter', 'sunflower butter', 'nut butter', 'cashew butter'], emoji: '🥜', category: 'condiment', color: '#D4AC0D' },
  { keywords: ['jam', 'jelly', 'preserves', 'marmalade', 'fruit spread'], emoji: '🍓', category: 'condiment', color: '#C0392B' },
  { keywords: ['honey'], emoji: '🍯', category: 'condiment', color: '#F39C12' },
  { keywords: ['maple syrup', 'agave', 'corn syrup'], emoji: '🍯', category: 'condiment', color: '#A04000' },
  { keywords: ['tahini'], emoji: '🫙', category: 'condiment', color: '#D4AC0D' },
  { keywords: ['nutella', 'hazelnut spread'], emoji: '🍫', category: 'condiment', color: '#5D4037' },

  // ── OILS & VINEGARS ───────────────────────────────────────────────────────
  { keywords: ['olive oil', 'extra virgin'], emoji: '🫒', category: 'oil', color: '#27AE60' },
  { keywords: ['vegetable oil', 'canola oil', 'sunflower oil', 'avocado oil', 'grapeseed oil', 'sesame oil', 'peanut oil'], emoji: '🫙', category: 'oil', color: '#F4D03F' },
  { keywords: ['coconut oil'], emoji: '🥥', category: 'oil', color: '#F4F6F7' },
  { keywords: ['vinegar', 'apple cider vinegar', 'white vinegar', 'red wine vinegar', 'rice vinegar', 'balsamic vinegar'], emoji: '🫙', category: 'oil', color: '#7D6608' },

  // ── SNACKS ────────────────────────────────────────────────────────────────
  { keywords: ['chips', 'potato chips', 'tortilla chips', 'corn chips', 'veggie chips', 'pita chips'], emoji: '🥔', category: 'snack', color: '#F4D03F' },
  { keywords: ['crackers', 'saltine', 'graham crackers', 'rice crackers'], emoji: '🍘', category: 'snack', color: '#D4AC0D' },
  { keywords: ['popcorn'], emoji: '🍿', category: 'snack', color: '#F4D03F' },
  { keywords: ['nuts', 'mixed nuts', 'trail mix'], emoji: '🥜', category: 'snack', color: '#A04000' },
  { keywords: ['almonds', 'almond'], emoji: '🥜', category: 'snack', color: '#D4AC0D' },
  { keywords: ['cashews', 'cashew'], emoji: '🥜', category: 'snack', color: '#F4D03F' },
  { keywords: ['peanuts', 'peanut'], emoji: '🥜', category: 'snack', color: '#D4AC0D' },
  { keywords: ['walnuts', 'walnut', 'pecans', 'pecan', 'pistachios', 'pistachio', 'macadamia', 'brazil nuts', 'pine nuts', 'sunflower seeds', 'pumpkin seeds', 'chia seeds', 'flax seeds', 'hemp seeds', 'sesame seeds', 'poppy seeds'], emoji: '🥜', category: 'snack', color: '#A04000' },
  { keywords: ['protein bar', 'energy bar', 'clif bar', 'kind bar', 'lara bar', 'rx bar'], emoji: '💪', category: 'snack', color: '#E67E22' },
  { keywords: ['rice cake', 'rice cakes'], emoji: '🍘', category: 'snack', color: '#F4F6F7' },
  { keywords: ['jerky', 'beef jerky', 'meat stick'], emoji: '🥩', category: 'snack', color: '#922B21' },
  { keywords: ['seaweed snack', 'nori snack'], emoji: '🌿', category: 'snack', color: '#145A32' },

  // ── SWEETS & CANDY ────────────────────────────────────────────────────────
  { keywords: ['chocolate', 'dark chocolate', 'milk chocolate', 'white chocolate', 'chocolate bar'], emoji: '🍫', category: 'sweet', color: '#5D4037' },
  { keywords: ['candy', 'gummy', 'gummies', 'gummy bears', 'jolly rancher', 'skittles', 'starburst', 'lifesavers'], emoji: '🍬', category: 'sweet', color: '#E91E63' },
  { keywords: ['gum', 'chewing gum', 'trident', 'orbit'], emoji: '🍬', category: 'sweet', color: '#00BCD4' },
  { keywords: ['lollipop', 'lollipops'], emoji: '🍭', category: 'sweet', color: '#E91E63' },
  { keywords: ['marshmallow', 'marshmallows'], emoji: '☁️', category: 'sweet', color: '#F4F6F7' },
  { keywords: ['sprinkles', 'rainbow sprinkles'], emoji: '🎂', category: 'sweet', color: '#E91E63' },
  { keywords: ['caramel', 'toffee', 'butterscotch'], emoji: '🍬', category: 'sweet', color: '#F39C12' },

  // ── BEVERAGES (NON-ALCOHOL) ────────────────────────────────────────────────
  { keywords: ['water', 'sparkling water', 'mineral water', 'seltzer', 'la croix', 'perrier', 'topo chico'], emoji: '💧', category: 'beverage', color: '#2E86C1' },
  { keywords: ['juice', 'orange juice', 'apple juice', 'cranberry juice', 'grape juice', 'pineapple juice', 'grapefruit juice', 'lemon juice', 'lime juice', 'pomegranate juice', 'v8'], emoji: '🧃', category: 'beverage', color: '#E67E22' },
  { keywords: ['soda', 'cola', 'coke', 'pepsi', 'sprite', 'dr pepper', 'root beer', 'ginger ale', 'cream soda', '7up', 'mountain dew'], emoji: '🥤', category: 'beverage', color: '#2E86C1' },
  { keywords: ['energy drink', 'red bull', 'monster energy', 'bang energy'], emoji: '⚡', category: 'beverage', color: '#F4D03F' },
  { keywords: ['sports drink', 'gatorade', 'powerade', 'body armor', 'prime'], emoji: '🏃', category: 'beverage', color: '#F39C12' },
  { keywords: ['lemonade', 'iced tea', 'sweet tea', 'arnold palmer'], emoji: '🧃', category: 'beverage', color: '#F4D03F' },
  { keywords: ['kombucha', 'kefir water', 'probiotic drink'], emoji: '🫙', category: 'beverage', color: '#7D3C98' },

  // ── COFFEE & TEA ──────────────────────────────────────────────────────────
  { keywords: ['coffee', 'ground coffee', 'whole bean', 'espresso', 'cold brew', 'instant coffee', 'nespresso', 'k-cup', 'coffee pod'], emoji: '☕', category: 'coffee_tea', color: '#5D4037' },
  { keywords: ['tea', 'green tea', 'black tea', 'herbal tea', 'chamomile', 'peppermint tea', 'white tea', 'oolong', 'matcha', 'chai', 'tea bags'], emoji: '🍵', category: 'coffee_tea', color: '#27AE60' },
  { keywords: ['hot chocolate', 'cocoa mix', 'hot cocoa'], emoji: '🍫', category: 'coffee_tea', color: '#5D4037' },
  { keywords: ['creamer', 'coffee creamer', 'oat creamer', 'almond creamer'], emoji: '🥛', category: 'coffee_tea', color: '#F4F6F7' },

  // ── ALCOHOL ───────────────────────────────────────────────────────────────
  { keywords: ['beer', 'craft beer', 'lager', 'ale', 'ipa', 'stout', 'porter'], emoji: '🍺', category: 'alcohol', color: '#D4AC0D' },
  { keywords: ['wine', 'red wine', 'white wine', 'rosé', 'sparkling wine', 'champagne', 'prosecco', 'pinot', 'cabernet', 'chardonnay', 'merlot', 'sauvignon blanc'], emoji: '🍷', category: 'alcohol', color: '#922B21' },
  { keywords: ['vodka', 'tequila', 'gin', 'rum', 'whiskey', 'bourbon', 'scotch', 'brandy', 'cognac', 'spirits', 'liquor'], emoji: '🥃', category: 'alcohol', color: '#D4AC0D' },
  { keywords: ['cider', 'hard cider'], emoji: '🍺', category: 'alcohol', color: '#F4D03F' },
  { keywords: ['seltzers', 'hard seltzer', 'white claw', 'truly'], emoji: '🍺', category: 'alcohol', color: '#2E86C1' },

  // ── FROZEN ────────────────────────────────────────────────────────────────
  { keywords: ['frozen pizza'], emoji: '🍕', category: 'frozen', color: '#E67E22' },
  { keywords: ['frozen dinner', 'frozen meal', 'lean cuisine', 'stouffer\'s', 'marie callender'], emoji: '🧊', category: 'frozen', color: '#2E86C1' },
  { keywords: ['frozen vegetables', 'frozen peas', 'frozen corn', 'frozen broccoli', 'frozen spinach', 'frozen edamame'], emoji: '🥦', category: 'frozen', color: '#27AE60' },
  { keywords: ['frozen fruit', 'frozen berries', 'frozen mango'], emoji: '🍓', category: 'frozen', color: '#C0392B' },
  { keywords: ['frozen waffles', 'eggo', 'frozen pancakes'], emoji: '🥞', category: 'frozen', color: '#D4AC0D' },
  { keywords: ['frozen burrito', 'frozen bowl', 'frozen entree'], emoji: '🧊', category: 'frozen', color: '#2E86C1' },
  { keywords: ['frozen shrimp', 'frozen fish', 'fish sticks', 'fish fillets'], emoji: '🦐', category: 'frozen', color: '#E74C3C' },

  // ── BAKING ────────────────────────────────────────────────────────────────
  { keywords: ['sugar', 'white sugar', 'granulated sugar', 'cane sugar', 'powdered sugar', 'confectioner\'s sugar'], emoji: '🍬', category: 'baking', color: '#F4F6F7' },
  { keywords: ['brown sugar'], emoji: '🍬', category: 'baking', color: '#A04000' },
  { keywords: ['baking soda', 'bicarbonate'], emoji: '🌾', category: 'baking', color: '#F4F6F7' },
  { keywords: ['baking powder'], emoji: '🌾', category: 'baking', color: '#F4F6F7' },
  { keywords: ['yeast', 'active dry yeast', 'instant yeast'], emoji: '🌾', category: 'baking', color: '#D4AC0D' },
  { keywords: ['vanilla', 'vanilla extract'], emoji: '🫙', category: 'baking', color: '#5D4037' },
  { keywords: ['chocolate chips', 'baking chocolate', 'cocoa powder'], emoji: '🍫', category: 'baking', color: '#5D4037' },
  { keywords: ['shortening', 'lard', 'crisco'], emoji: '🫙', category: 'baking', color: '#F4F6F7' },
  { keywords: ['gelatin', 'agar agar'], emoji: '🫙', category: 'baking', color: '#F4F6F7' },
  { keywords: ['cornstarch', 'arrowroot'], emoji: '🌾', category: 'baking', color: '#F4F6F7' },

  // ── SPICES & HERBS (DRY) ──────────────────────────────────────────────────
  { keywords: ['salt', 'sea salt', 'kosher salt', 'pink himalayan salt', 'table salt'], emoji: '🧂', category: 'spice', color: '#F4F6F7' },
  { keywords: ['pepper', 'black pepper', 'white pepper', 'peppercorn'], emoji: '🧂', category: 'spice', color: '#2C2C2C' },
  { keywords: ['garlic powder', 'garlic salt', 'granulated garlic'], emoji: '🧄', category: 'spice', color: '#F4F6F7' },
  { keywords: ['onion powder', 'onion salt', 'onion flakes'], emoji: '🧅', category: 'spice', color: '#F4F6F7' },
  { keywords: ['cinnamon', 'cassia'], emoji: '🍂', category: 'spice', color: '#A04000' },
  { keywords: ['paprika', 'smoked paprika', 'sweet paprika'], emoji: '🌶️', category: 'spice', color: '#C0392B' },
  { keywords: ['cumin'], emoji: '🌿', category: 'spice', color: '#D4AC0D' },
  { keywords: ['turmeric', 'curry powder', 'curry'], emoji: '🌿', category: 'spice', color: '#F39C12' },
  { keywords: ['cayenne', 'chili powder', 'red pepper flakes', 'crushed red pepper'], emoji: '🌶️', category: 'spice', color: '#C0392B' },
  { keywords: ['italian seasoning', 'herbs de provence', 'poultry seasoning', 'old bay', 'cajun seasoning', 'everything bagel seasoning'], emoji: '🌿', category: 'spice', color: '#27AE60' },
  { keywords: ['nutmeg', 'clove', 'allspice', 'cardamom', 'ginger powder', 'mace'], emoji: '🌿', category: 'spice', color: '#D4AC0D' },
  { keywords: ['vanilla bean', 'saffron', 'bay leaf', 'bay leaves'], emoji: '🌿', category: 'spice', color: '#27AE60' },

  // ── CLEANING PRODUCTS ─────────────────────────────────────────────────────
  { keywords: ['dish soap', 'dish detergent', 'dawn', 'palmolive', 'seventh generation dish'], emoji: '🫧', category: 'cleaning', color: '#2E86C1' },
  { keywords: ['dishwasher pods', 'dishwasher tabs', 'cascade', 'finish', 'dishwasher detergent'], emoji: '🫧', category: 'cleaning', color: '#2E86C1' },
  { keywords: ['all purpose cleaner', 'lysol spray', 'method cleaner', '409', 'fantastik', 'windex'], emoji: '🧴', category: 'cleaning', color: '#2E86C1' },
  { keywords: ['bathroom cleaner', 'toilet cleaner', 'tub cleaner', 'scrubbing bubbles', 'comet'], emoji: '🧴', category: 'cleaning', color: '#7D3C98' },
  { keywords: ['window cleaner', 'glass cleaner', 'windex'], emoji: '🪟', category: 'cleaning', color: '#2E86C1' },
  { keywords: ['floor cleaner', 'mop solution', 'bona', 'swiffer wet'], emoji: '🧹', category: 'cleaning', color: '#27AE60' },
  { keywords: ['bleach', 'clorox bleach'], emoji: '🧴', category: 'cleaning', color: '#F4F6F7' },
  { keywords: ['disinfecting wipes', 'clorox wipes', 'lysol wipes', 'cleaning wipes'], emoji: '🧽', category: 'cleaning', color: '#F4D03F' },
  { keywords: ['sponge', 'scrub sponge', 'scotch brite'], emoji: '🧽', category: 'cleaning', color: '#F4D03F' },
  { keywords: ['trash bags', 'garbage bags', 'garbage can liners', 'kitchen trash bags'], emoji: '🗑️', category: 'cleaning', color: '#2C2C2C' },

  // ── LAUNDRY ───────────────────────────────────────────────────────────────
  { keywords: ['laundry detergent', 'tide', 'gain', 'all detergent', 'arm & hammer', 'dreft', 'persil'], emoji: '🫧', category: 'laundry', color: '#2E86C1' },
  { keywords: ['fabric softener', 'downy', 'snuggle', 'bounce dryer sheets', 'dryer sheets'], emoji: '🌸', category: 'laundry', color: '#F4D03F' },
  { keywords: ['stain remover', 'shout spray', 'oxi clean', 'zout', 'carbona'], emoji: '🧴', category: 'laundry', color: '#E91E63' },
  { keywords: ['laundry pods', 'tide pods', 'gain pods', 'all pods'], emoji: '🫧', category: 'laundry', color: '#2E86C1' },

  // ── PAPER & STORAGE ───────────────────────────────────────────────────────
  { keywords: ['paper towels', 'bounty', 'viva', 'brawny', 'scott paper towels'], emoji: '🧻', category: 'paper', color: '#F4D03F' },
  { keywords: ['toilet paper', 'bath tissue', 'charmin', 'cottonelle', 'scott tissue'], emoji: '🧻', category: 'paper', color: '#F4F6F7' },
  { keywords: ['tissue', 'kleenex', 'facial tissue', 'puffs'], emoji: '🧻', category: 'paper', color: '#F4F6F7' },
  { keywords: ['napkins', 'paper napkins'], emoji: '🧻', category: 'paper', color: '#F4F6F7' },
  { keywords: ['towel', 'bath towel', 'hand towel', 'beach towel', 'dish towel', 'kitchen towel', 'washcloth', 'towel set'], emoji: '🧺', category: 'household', color: '#5DADE2' },
  { keywords: ['aluminum foil', 'tin foil', 'reynolds wrap'], emoji: '✨', category: 'paper', color: '#839192' },
  { keywords: ['plastic wrap', 'saran wrap', 'cling wrap'], emoji: '🫙', category: 'paper', color: '#2E86C1' },
  { keywords: ['parchment paper', 'wax paper', 'butcher paper'], emoji: '📄', category: 'paper', color: '#F4F6F7' },
  { keywords: ['zip lock', 'ziplock', 'ziploc bags', 'sandwich bags', 'freezer bags', 'glad bags'], emoji: '🫙', category: 'paper', color: '#2E86C1' },
  { keywords: ['storage containers', 'tupperware', 'food containers', 'meal prep containers'], emoji: '🫙', category: 'paper', color: '#27AE60' },
  { keywords: ['coffee filters', 'paper plates', 'paper cups', 'disposable cups', 'solo cups'], emoji: '☕', category: 'paper', color: '#F4F6F7' },

  // ── PERSONAL CARE ─────────────────────────────────────────────────────────
  { keywords: ['shampoo', 'head & shoulders', 'pantene', 'dove shampoo', 'tresemmé'], emoji: '🧴', category: 'personal_care', color: '#7D3C98' },
  { keywords: ['conditioner', 'hair conditioner', 'hair mask', 'leave in conditioner'], emoji: '🧴', category: 'personal_care', color: '#7D3C98' },
  { keywords: ['body wash', 'shower gel', 'dove body wash', 'old spice body wash', 'irish spring'], emoji: '🧴', category: 'personal_care', color: '#2E86C1' },
  { keywords: ['soap', 'bar soap', 'hand soap', 'dial soap', 'ivory soap', 'method soap'], emoji: '🫧', category: 'personal_care', color: '#F4F6F7' },
  { keywords: ['deodorant', 'antiperspirant', 'old spice', 'dove deodorant', 'degree', 'secret', 'native deodorant'], emoji: '💨', category: 'personal_care', color: '#F4F6F7' },
  { keywords: ['toothpaste', 'colgate', 'crest', 'sensodyne', 'arm hammer toothpaste'], emoji: '🪥', category: 'personal_care', color: '#2E86C1' },
  { keywords: ['toothbrush', 'electric toothbrush', 'oral b', 'sonicare', 'colgate toothbrush'], emoji: '🪥', category: 'personal_care', color: '#2E86C1' },
  { keywords: ['dental floss', 'floss', 'floss picks', 'reach floss', 'glide floss'], emoji: '🦷', category: 'personal_care', color: '#F4F6F7' },
  { keywords: ['mouthwash', 'listerine', 'scope', 'act mouthwash'], emoji: '🫙', category: 'personal_care', color: '#2E86C1' },
  { keywords: ['lotion', 'body lotion', 'moisturizer', 'hand cream', 'cetaphil', 'aveeno', 'lubriderm', 'vaseline', 'cocoa butter'], emoji: '🧴', category: 'personal_care', color: '#F9E4B7' },
  { keywords: ['sunscreen', 'spf', 'sunblock', 'neutrogena sunscreen', 'banana boat', 'coppertone'], emoji: '☀️', category: 'personal_care', color: '#F4D03F' },
  { keywords: ['razor', 'gilette', 'schick', 'disposable razors'], emoji: '🪒', category: 'personal_care', color: '#839192' },
  { keywords: ['shaving cream', 'shaving gel', 'barbasol', 'edge shaving gel'], emoji: '🫧', category: 'personal_care', color: '#F4F6F7' },
  { keywords: ['feminine hygiene', 'tampons', 'pads', 'always', 'tampax', 'liners', 'menstrual'], emoji: '🌸', category: 'personal_care', color: '#E91E63' },
  { keywords: ['cotton balls', 'cotton rounds', 'q tips', 'cotton swabs'], emoji: '🌸', category: 'personal_care', color: '#F4F6F7' },
  { keywords: ['lip balm', 'chapstick', 'burt\'s bees', 'carmex'], emoji: '💄', category: 'personal_care', color: '#E91E63' },
  { keywords: ['hair gel', 'hair wax', 'pomade', 'mousse', 'hair spray', 'dry shampoo'], emoji: '🧴', category: 'personal_care', color: '#7D3C98' },
  { keywords: ['nail polish', 'nail remover', 'acetone'], emoji: '💅', category: 'personal_care', color: '#E91E63' },

  // ── MEDICINE & HEALTH ─────────────────────────────────────────────────────
  { keywords: ['ibuprofen', 'advil', 'motrin'], emoji: '💊', category: 'medicine', color: '#E74C3C' },
  { keywords: ['tylenol', 'acetaminophen', 'paracetamol'], emoji: '💊', category: 'medicine', color: '#E74C3C' },
  { keywords: ['aspirin', 'bayer'], emoji: '💊', category: 'medicine', color: '#E74C3C' },
  { keywords: ['antihistamine', 'benadryl', 'zyrtec', 'claritin', 'allegra', 'allergy medicine'], emoji: '💊', category: 'medicine', color: '#E74C3C' },
  { keywords: ['cold medicine', 'nyquil', 'dayquil', 'mucinex', 'sudafed', 'robitussin', 'theraflu'], emoji: '💊', category: 'medicine', color: '#2E86C1' },
  { keywords: ['antacid', 'tums', 'pepto bismol', 'maalox', 'rolaids', 'zantac', 'prilosec'], emoji: '💊', category: 'medicine', color: '#F4D03F' },
  { keywords: ['bandaid', 'band aid', 'band-aid', 'bandage', 'adhesive bandage', 'neosporin', 'first aid'], emoji: '🩹', category: 'medicine', color: '#F4D03F' },
  { keywords: ['vitamins', 'vitamin c', 'vitamin d', 'multivitamin', 'omega 3', 'fish oil', 'supplement', 'zinc', 'magnesium', 'probiotics', 'melatonin', 'biotin', 'collagen'], emoji: '💊', category: 'medicine', color: '#F4D03F' },
  { keywords: ['protein powder', 'whey protein', 'protein shake'], emoji: '💪', category: 'medicine', color: '#E67E22' },

  // ── BABY PRODUCTS ─────────────────────────────────────────────────────────
  { keywords: ['diapers', 'pampers', 'huggies', 'luvs', 'pull ups'], emoji: '👶', category: 'baby', color: '#F4F6F7' },
  { keywords: ['baby wipes', 'huggies wipes', 'pampers wipes', 'waterwipes'], emoji: '👶', category: 'baby', color: '#F4F6F7' },
  { keywords: ['formula', 'baby formula', 'similac', 'enfamil', 'gerber formula'], emoji: '🍼', category: 'baby', color: '#F4D03F' },
  { keywords: ['baby food', 'gerber', 'beech nut', 'happy baby', 'puree'], emoji: '👶', category: 'baby', color: '#F4D03F' },
  { keywords: ['baby wash', 'baby shampoo', 'johnson\'s baby', 'mustela'], emoji: '🛁', category: 'baby', color: '#2E86C1' },
  { keywords: ['baby lotion', 'baby oil', 'diaper cream', 'desitin', 'aquaphor baby'], emoji: '🧴', category: 'baby', color: '#F9E4B7' },

  // ── PET SUPPLIES ──────────────────────────────────────────────────────────
  { keywords: ['dog food', 'kibble', 'purina', 'blue buffalo', 'iams', 'royal canin', 'hills dog'], emoji: '🐕', category: 'pet', color: '#D4AC0D' },
  { keywords: ['cat food', 'friskies', 'fancy feast', 'whiskas', 'meow mix', 'hills cat'], emoji: '🐈', category: 'pet', color: '#D4AC0D' },
  { keywords: ['pet food', 'pet treats', 'pet snacks'], emoji: '🐾', category: 'pet', color: '#D4AC0D' },
  { keywords: ['dog treats', 'milkbone', 'greenies', 'beggin strips'], emoji: '🦴', category: 'pet', color: '#D4AC0D' },
  { keywords: ['cat litter', 'clumping litter', 'tidy cats', 'arm hammer litter', 'fresh step'], emoji: '🐱', category: 'pet', color: '#839192' },
  { keywords: ['fish food', 'bird seed', 'hamster food', 'rabbit food', 'guinea pig food'], emoji: '🐾', category: 'pet', color: '#D4AC0D' },

  // ── HOUSEHOLD ─────────────────────────────────────────────────────────────
  { keywords: ['batteries', 'aa batteries', 'aaa batteries', 'c batteries', 'd batteries', '9v battery', 'duracell', 'energizer'], emoji: '🔋', category: 'household', color: '#2E86C1' },
  { keywords: ['light bulb', 'light bulbs', 'led bulb', 'lightbulb', 'ge bulb', 'philips bulb'], emoji: '💡', category: 'household', color: '#F4D03F' },
  { keywords: ['candle', 'candles', 'scented candle', 'yankee candle'], emoji: '🕯️', category: 'household', color: '#F4D03F' },
  { keywords: ['matches', 'lighter', 'bbq lighter'], emoji: '🔥', category: 'household', color: '#E74C3C' },
  { keywords: ['tape', 'scotch tape', 'duct tape', 'masking tape', 'painters tape'], emoji: '🗂️', category: 'household', color: '#F4D03F' },
  { keywords: ['air freshener', 'febreze', 'glade', 'ozium', 'car freshener', 'reed diffuser'], emoji: '🌸', category: 'household', color: '#F4D03F' },
  { keywords: ['wrapping paper', 'gift wrap', 'tissue paper', 'gift bags', 'ribbon'], emoji: '🎁', category: 'household', color: '#E91E63' },
  { keywords: ['mop', 'broom', 'dustpan', 'duster', 'swiffer', 'vacuum bags'], emoji: '🧹', category: 'household', color: '#D4AC0D' },
  { keywords: ['hand sanitizer', 'purell', 'germ x'], emoji: '🫧', category: 'household', color: '#27AE60' },
  { keywords: ['extension cord', 'surge protector', 'outlet', 'electrical tape'], emoji: '🔌', category: 'household', color: '#2C2C2C' },
  { keywords: ['gloves', 'rubber gloves', 'cleaning gloves', 'nitrile gloves'], emoji: '🧤', category: 'household', color: '#27AE60' },
  { keywords: ['insect repellent', 'bug spray', 'raid', 'deet', 'off spray'], emoji: '🐛', category: 'household', color: '#27AE60' },
  { keywords: ['sunscreen wipes', 'wet wipes', 'baby wipes'], emoji: '🌸', category: 'household', color: '#F4F6F7' },
];

const DEFAULT: ItemClassification = {
  emoji: '📦',
  category: 'other',
  color: '#5D6D7E',
  storageLocation: 'pantry' as StorageLocation,
};

// Singularize so "towels" matches keyword "towel" and vice versa. Both the
// input and the keywords pass through this, so imperfect stems (glass→glas)
// still match each other consistently.
function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/**
 * Returns emoji + category for any pantry item name.
 *
 * Matching is whole-word phrase matching (never substring — "pineapple" must
 * not match "apple", and "towel" must not match "paper towels"). When several
 * rules match, the most specific wins: more matched words beats fewer, then a
 * keyword covering the item's last word (the head noun: "apple pie" is a pie)
 * beats one that doesn't, then longer keyword text.
 */
export function classifyItem(name: string): ItemClassification {
  if (!name?.trim()) return DEFAULT;
  const words = normalizeWords(name);
  if (words.length === 0) return DEFAULT;
  const text = ` ${words.join(' ')} `;
  const lastWord = words[words.length - 1];

  let bestRule: (typeof RULES)[number] | null = null;
  let bestScore = 0;
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      const kwWords = normalizeWords(kw);
      if (kwWords.length === 0) continue;
      const phrase = ` ${kwWords.join(' ')} `;
      if (!text.includes(phrase)) continue;
      const score =
        kwWords.length * 1000 +
        (kwWords[kwWords.length - 1] === lastWord ? 100 : 0) +
        Math.min(phrase.length, 99);
      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    }
  }

  if (bestRule) {
    return {
      emoji: bestRule.emoji,
      category: bestRule.category,
      color: bestRule.color,
      storageLocation: CATEGORY_LOCATION[bestRule.category],
    };
  }
  return DEFAULT;
}

/** Quick helper — returns just the storage location for an item name. */
export function getStorageLocation(name: string): StorageLocation {
  return classifyItem(name).storageLocation;
}

/** Human-readable category label. */
export function categoryLabel(cat: ItemCategory): string {
  const labels: Record<ItemCategory, string> = {
    produce_fruit: 'Fruit',
    produce_veg: 'Vegetable',
    meat: 'Meat & Poultry',
    seafood: 'Seafood',
    dairy: 'Dairy',
    eggs: 'Eggs',
    bread: 'Bread & Bakery',
    grains: 'Grains & Cereal',
    pasta: 'Pasta & Noodles',
    canned: 'Canned & Jarred',
    condiment: 'Condiment',
    sauce: 'Sauce',
    oil: 'Oil & Vinegar',
    snack: 'Snack',
    sweet: 'Sweets & Candy',
    beverage: 'Beverage',
    coffee_tea: 'Coffee & Tea',
    alcohol: 'Alcohol',
    frozen: 'Frozen',
    baking: 'Baking',
    spice: 'Spice & Herb',
    cleaning: 'Cleaning',
    laundry: 'Laundry',
    paper: 'Paper & Storage',
    personal_care: 'Personal Care',
    medicine: 'Medicine & Health',
    baby: 'Baby',
    pet: 'Pet Supplies',
    household: 'Household',
    other: 'Other',
  };
  return labels[cat];
}
