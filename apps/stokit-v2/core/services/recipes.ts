import type { PantryItem } from '../../types';

export interface RecipeSuggestion {
  id: string;
  title: string;
  description: string;
  matchedIngredients: string[];
  missingIngredients: string[];
  matchScore: number;
  imageUrl?: string;
}

const LOCAL_FALLBACK: RecipeSuggestion[] = [
  {
    id: 'f1',
    title: 'Garlic Butter Pasta',
    description: 'A quick 15-minute pasta dish using pantry staples.',
    matchedIngredients: ['pasta', 'garlic', 'butter'],
    missingIngredients: ['parmesan'],
    matchScore: 0.75,
    imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&q=80',
  },
  {
    id: 'f2',
    title: 'Chicken Stir Fry',
    description: 'Healthy and fast dinner using any vegetables you have.',
    matchedIngredients: ['chicken', 'soy sauce', 'garlic', 'ginger'],
    missingIngredients: ['broccoli', 'rice'],
    matchScore: 0.66,
    imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&q=80',
  },
];

function normalize(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Connects to TheMealDB (a free, public recipe API) to pull live recipes
 * based on what the user has in their pantry.
 */
export async function suggestRecipes(pantryItems: PantryItem[]): Promise<RecipeSuggestion[]> {
  try {
    const availableNames = pantryItems.map((item) => normalize(item.name));
    if (availableNames.length === 0) return [];

    // Prioritize main ingredients for better API results
    const mains = ['chicken', 'beef', 'pork', 'fish', 'salmon', 'egg', 'pasta', 'rice', 'potato', 'beans'];
    let searchIngredient = availableNames.find((name) => mains.some((m) => name.includes(m)));
    
    // If no main ingredient found, pick the first available item
    if (!searchIngredient) {
      searchIngredient = availableNames[0];
    }
    
    // Format ingredient for TheMealDB (replace spaces with underscores)
    const queryTerm = searchIngredient.replace(/\s+/g, '_');

    // 1. Find meals by ingredient
    const filterRes = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${queryTerm}`);
    if (!filterRes.ok) throw new Error('API down');
    const filterData = await filterRes.json();
    
    // If no meals match this ingredient, return empty or fallback
    if (!filterData.meals || filterData.meals.length === 0) {
      return LOCAL_FALLBACK;
    }

    // Grab up to 3 random meals
    const shuffled = filterData.meals.sort(() => 0.5 - Math.random());
    const topMeals = shuffled.slice(0, 3);

    const suggestions: RecipeSuggestion[] = [];

    // 2. Fetch full details for each meal to compare ingredients
    for (const meal of topMeals) {
      const lookupRes = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`);
      if (!lookupRes.ok) continue;
      const lookupData = await lookupRes.json();
      const mealDetail = lookupData.meals?.[0];
      if (!mealDetail) continue;

      const matched: string[] = [];
      const missing: string[] = [];
      
      // TheMealDB returns ingredients in keys strIngredient1 to strIngredient20
      for (let i = 1; i <= 20; i++) {
        const ing = mealDetail[`strIngredient${i}`];
        if (ing && ing.trim()) {
          const req = normalize(ing);
          const isAvailable = availableNames.some((avail) => avail.includes(req) || req.includes(avail));
          if (isAvailable) {
            matched.push(ing.trim());
          } else {
            missing.push(ing.trim());
          }
        }
      }

      const totalIngredients = matched.length + missing.length;
      const matchScore = totalIngredients > 0 ? matched.length / totalIngredients : 0;

      suggestions.push({
        id: mealDetail.idMeal,
        title: mealDetail.strMeal,
        description: `Origin: ${mealDetail.strArea || 'Global'} • Category: ${mealDetail.strCategory || 'Dinner'}`,
        matchedIngredients: matched,
        missingIngredients: missing,
        matchScore,
        imageUrl: mealDetail.strMealThumb,
      });
    }

    // Sort by match score descending
    suggestions.sort((a, b) => b.matchScore - a.matchScore);

    return suggestions.length > 0 ? suggestions : LOCAL_FALLBACK;
  } catch (error) {
    console.warn('Failed to fetch from TheMealDB, using fallback.', error);
    return LOCAL_FALLBACK;
  }
}
