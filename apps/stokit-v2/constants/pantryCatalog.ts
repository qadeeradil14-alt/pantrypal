import type { Unit } from '../types';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const PANTRY_CATEGORIES = [
  'Produce', 'Dairy', 'Meat', 'Seafood', 'Bakery', 'Frozen',
  'Dry Goods', 'Canned', 'Spices', 'Drinks', 'Snacks', 'Kitchen',
  'Cleaning', 'Paper Goods', 'Personal Care', 'Baby', 'Pet',
  'Automotive', 'Hardware', 'Health', 'Office', 'Other',
] as const;

export type PantryCatalogCategory = typeof PANTRY_CATEGORIES[number];

export interface PantryCatalogItem {
  id: string;
  name: string;
  category: PantryCatalogCategory;
  icon: string;
  defaultUnit: Unit;
  keywords?: string[];
}

const item = (
  category: PantryCatalogCategory,
  name: string,
  icon: string,
  defaultUnit: Unit = 'unit',
  keywords?: string[],
): PantryCatalogItem => ({
  id: `${category}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  category,
  icon,
  defaultUnit,
  keywords,
});

export const PANTRY_CATALOG: PantryCatalogItem[] = [
  // Produce
  item('Produce', 'Apple', '🍎'), item('Produce', 'Banana', '🍌'), item('Produce', 'Orange', '🍊'),
  item('Produce', 'Lemon', '🍋'), item('Produce', 'Lime', '🍈'), item('Produce', 'Grapes', '🍇', 'lb'),
  item('Produce', 'Strawberry', '🍓', 'pack'), item('Produce', 'Blueberry', '🫐', 'pack'), item('Produce', 'Watermelon', '🍉'),
  item('Produce', 'Tomato', '🍅'), item('Produce', 'Onion', '🧅'), item('Produce', 'Garlic', '🧄'),
  item('Produce', 'Potato', '🥔'), item('Produce', 'Carrot', '🥕', 'lb'), item('Produce', 'Broccoli', '🥦'),
  item('Produce', 'Lettuce', '🥬'), item('Produce', 'Spinach', '🌿', 'pack'), item('Produce', 'Cucumber', '🥒'),
  item('Produce', 'Bell pepper', '🫑'), item('Produce', 'Avocado', '🥑'),

  // Dairy
  item('Dairy', 'Milk', '🥛', 'gal'), item('Dairy', 'Eggs', '🥚', 'dozen'), item('Dairy', 'Cheese', '🧀', 'pack'),
  item('Dairy', 'Yogurt', '🥣'), item('Dairy', 'Butter', '🧈', 'pack'), item('Dairy', 'Cream cheese', '🧀', 'pack'),
  item('Dairy', 'Sour cream', '🫙'), item('Dairy', 'Heavy cream', '🫗'), item('Dairy', 'Goat cheese', '🧀', 'pack'),

  // Meat
  item('Meat', 'Chicken', '🍗', 'lb'), item('Meat', 'Ground beef', '🥩', 'lb'), item('Meat', 'Steak', '🥩', 'lb'),
  item('Meat', 'Lamb', '🥩', 'lb'), item('Meat', 'Turkey', '🦃', 'lb'), item('Meat', 'Sausage', '🌭', 'pack'),
  item('Meat', 'Bacon', '🥓', 'pack'),

  // Seafood
  item('Seafood', 'Salmon', '🍣', 'lb'), item('Seafood', 'Shrimp', '🦐', 'lb'),
  item('Seafood', 'Tuna', '🐡', 'lb'), item('Seafood', 'Cod', '🐠', 'lb'),
  item('Seafood', 'Crab', '🦀', 'lb'), item('Seafood', 'Lobster', '🦞', 'lb'),

  // Bakery
  item('Bakery', 'Bread', '🍞'), item('Bakery', 'Bagels', '🥯', 'pack'), item('Bakery', 'Tortillas', '🫓', 'pack'),
  item('Bakery', 'Pita bread', '🫓', 'pack'), item('Bakery', 'Croissants', '🥐', 'pack'), item('Bakery', 'Buns', '🍞', 'pack'),

  // Frozen
  item('Frozen', 'Frozen vegetables', '🥦', 'pack'), item('Frozen', 'Frozen fruit', '🍓', 'pack'),
  item('Frozen', 'Ice cream', '🍦'), item('Frozen', 'Frozen pizza', '🍕'), item('Frozen', 'Frozen chicken', '🍗', 'pack'),

  // Dry Goods
  item('Dry Goods', 'Pasta', '🍝', 'box'), item('Dry Goods', 'Rice', '🍚', 'pack'), item('Dry Goods', 'Oats', '🌾', 'box'),
  item('Dry Goods', 'Flour', '🥞', 'pack'), item('Dry Goods', 'Sugar', '🧁', 'pack'), item('Dry Goods', 'Cereal', '🥣', 'box'),
  item('Dry Goods', 'Lentils', '🫘', 'lb'), item('Dry Goods', 'Beans', '🫘', 'lb'), item('Dry Goods', 'Chickpeas', '🫘', 'lb'),
  item('Dry Goods', 'Quinoa', '🍙', 'lb'),

  // Canned
  item('Canned', 'Canned tomatoes', '🍅', 'can'), item('Canned', 'Tomato sauce', '🫙', 'can'),
  item('Canned', 'Canned beans', '🫘', 'can'), item('Canned', 'Tuna can', '🐟', 'can'),
  item('Canned', 'Soup', '🍲', 'can'), item('Canned', 'Pickles', '🥒'), item('Canned', 'Jam', '🍓'),
  item('Canned', 'Peanut butter', '🥜'),

  // Spices & Condiments
  item('Spices', 'Salt', '🧂'), item('Spices', 'Black pepper', '🌶️'), item('Spices', 'Olive oil', '🫒'),
  item('Spices', 'Vegetable oil', '🫚'), item('Spices', 'Vinegar', '🍾'), item('Spices', 'Soy sauce', '🥢'),
  item('Spices', 'Ketchup', 'custom:ketchup'), item('Spices', 'Mustard', 'custom:mustard'),
  item('Spices', 'Mayonnaise', '🍳'), item('Spices', 'Hot sauce', '🔥'), item('Spices', 'Honey', '🍯'),
  item('Spices', 'Cinnamon', '🍂'), item('Spices', 'Cumin', '🌱'), item('Spices', 'Paprika', '🫑'),
  item('Spices', 'Turmeric', '🌼'),

  // Drinks
  item('Drinks', 'Water', '💧', 'pack'), item('Drinks', 'Juice', '🧃'), item('Drinks', 'Soda', '🥤', 'pack'),
  item('Drinks', 'Coffee', '☕'), item('Drinks', 'Tea', '🍵', 'box'), item('Drinks', 'Sparkling water', '🫧', 'pack'),

  // Snacks
  item('Snacks', 'Chips', '🍟', 'pack'), item('Snacks', 'Crackers', '🍘', 'box'), item('Snacks', 'Cookies', '🍪', 'pack'),
  item('Snacks', 'Popcorn', '🍿', 'box'), item('Snacks', 'Nuts', '🥜', 'pack'), item('Snacks', 'Pretzels', '🥨', 'pack'),
  item('Snacks', 'Chocolate', '🍫', 'pack'), item('Snacks', 'Candy', '🍬', 'pack'), item('Snacks', 'Gum', '🦷', 'pack'),
  item('Snacks', 'Mint', '🍃', 'pack'), item('Snacks', 'Ice cream', '🍦'), item('Snacks', 'Popsicles', '🍧', 'box'),
  item('Snacks', 'Dates', '🌴', 'pack'), item('Snacks', 'Granola bars', '🌾', 'box'),

  // Kitchen
  item('Kitchen', 'Plates', '🍽️', 'pack'), item('Kitchen', 'Bowls', '🍜', 'pack'), item('Kitchen', 'Cups', '🥤', 'pack'),
  item('Kitchen', 'Mugs', '🫖'), item('Kitchen', 'Forks', '🍴', 'pack'), item('Kitchen', 'Spoons', '🥄', 'pack'),
  item('Kitchen', 'Knives', '🔪', 'pack'), item('Kitchen', 'Napkins', '🧻', 'pack'), item('Kitchen', 'Food containers', '🥡', 'pack'),
  item('Kitchen', 'Aluminum foil', '🌀', 'box'), item('Kitchen', 'Plastic wrap', '🎁', 'box'),
  item('Kitchen', 'Zip bags', '🛍️', 'box'), item('Kitchen', 'Cutting board', '🪵'), item('Kitchen', 'Sponges', '🧽', 'pack'),

  // Cleaning
  item('Cleaning', 'Dish soap', 'custom:dishsoap'), item('Cleaning', 'Hand soap', 'custom:handsoap'), item('Cleaning', 'Laundry detergent', 'custom:laundry_detergent'),
  item('Cleaning', 'Fabric softener', 'custom:fabric_softener'), item('Cleaning', 'Bleach', 'custom:bleach'), item('Cleaning', 'All-purpose cleaner', 'custom:all_purpose_cleaner'),
  item('Cleaning', 'Glass cleaner', 'custom:glass_cleaner'), item('Cleaning', 'Disinfecting wipes', 'custom:wipes'),
  item('Cleaning', 'Trash bags', 'custom:trash_bags'), item('Cleaning', 'Broom', '🧹'), item('Cleaning', 'Mop', '🪣'),
  item('Cleaning', 'Paper towels', '🧻', 'pack'),

  // Paper Goods
  item('Paper Goods', 'Toilet paper', '🧻', 'pack'), item('Paper Goods', 'Paper towels', '🧻', 'pack'),
  item('Paper Goods', 'Tissues', '🤧', 'box'), item('Paper Goods', 'Napkins', '🧻', 'pack'),
  item('Paper Goods', 'Paper plates', '🍽️', 'pack'), item('Paper Goods', 'Paper cups', '🧃', 'pack'),

  // Personal Care
  item('Personal Care', 'Toothpaste', 'custom:toothpaste'), item('Personal Care', 'Toothbrush', '🪥'),
  item('Personal Care', 'Shampoo', 'custom:shampoo'), item('Personal Care', 'Conditioner', 'custom:conditioner'),
  item('Personal Care', 'Body wash', 'custom:bodywash'), item('Personal Care', 'Deodorant', 'custom:deodorant'),
  item('Personal Care', 'Lotion', 'custom:lotion'), item('Personal Care', 'Razors', '🪒', 'pack'),
  item('Personal Care', 'Shaving cream', '🧴'), item('Personal Care', 'Feminine care', '🌸', 'pack'),

  // Baby
  item('Baby', 'Diapers', '👶', 'pack'), item('Baby', 'Baby wipes', '🧼', 'pack'), item('Baby', 'Baby food', '🍼', 'pack'),
  item('Baby', 'Formula', '🍼'), item('Baby', 'Baby lotion', '🧴'),

  // Pet
  item('Pet', 'Dog food', '🐶', 'pack'), item('Pet', 'Cat food', '🐱', 'pack'), item('Pet', 'Pet treats', '🦴', 'pack'),
  item('Pet', 'Litter', '🐈', 'pack'),

  // Automotive
  item('Automotive', 'Motor oil', '🛢️'), item('Automotive', 'Wiper fluid', '🌧️'), item('Automotive', 'Car wash soap', '🚗'),
  item('Automotive', 'Air freshener', '🌺'), item('Automotive', 'Jumper cables', '⚡'), item('Automotive', 'Car battery', '🪫'),
  item('Automotive', 'Tire gauge', '🔧'), item('Automotive', 'Car wax', '✨'), item('Automotive', 'Window cleaner', '🪟'),
  item('Automotive', 'Funnels', '🧪'), item('Automotive', 'Antifreeze', '🧊'), item('Automotive', 'Brake fluid', '💦'),

  // Hardware
  item('Hardware', 'Light bulbs', '💡', 'pack'), item('Hardware', 'Batteries', '🔋', 'pack'), item('Hardware', 'Duct tape', '🎀'),
  item('Hardware', 'Zip ties', '🔗', 'pack'), item('Hardware', 'Extension cord', '🔌'), item('Hardware', 'Screws', '🪛', 'pack'),
  item('Hardware', 'Measuring tape', '📏'), item('Hardware', 'Paint', '🖌️'), item('Hardware', 'WD-40', '🔩'),
  item('Hardware', 'Sandpaper', '🪨', 'pack'), item('Hardware', 'Caulk', '💉'), item('Hardware', 'Superglue', '🫙'),

  // Health
  item('Health', 'Vitamins', '💊', 'pack'), item('Health', 'Pain reliever', '🩹'), item('Health', 'Cold medicine', '🌡️'),
  item('Health', 'Allergy medicine', '🌻'), item('Health', 'Bandages', '➕', 'pack'), item('Health', 'Sunscreen', '☀️'),
  item('Health', 'Bug spray', '🦟'), item('Health', 'Hand sanitizer', '🤲'), item('Health', 'Antacid', '⚗️'),
  item('Health', 'Cough drops', '🍭'), item('Health', 'Eye drops', '👁️'), item('Health', 'Thermometer', '🩺'),

  // Office
  item('Office', 'Pens', '🖊️', 'pack'), item('Office', 'Pencils', '✏️', 'pack'), item('Office', 'Notebooks', '📓'),
  item('Office', 'Printer paper', '📄', 'pack'), item('Office', 'Printer ink', '🖨️'), item('Office', 'Scissors', '✂️'),
  item('Office', 'Sticky notes', '🗒️', 'pack'), item('Office', 'Staples', '📎', 'pack'), item('Office', 'Tape', '🔖'),
  item('Office', 'Folders', '📁', 'pack'), item('Office', 'Markers', '🖍️', 'pack'), item('Office', 'Envelopes', '✉️', 'pack'),
];
