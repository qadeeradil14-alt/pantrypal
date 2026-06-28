import type { PantryItem } from '../../types';

export interface RecipeIngredientLine {
  name: string;
  measure: string;
  have: boolean;
}

export interface RecipeSuggestion {
  id: string;
  title: string;
  description: string;
  matchedIngredients: string[];
  missingIngredients: string[];
  matchScore: number;
  imageUrl?: string;
  instructions?: string;
  ingredientLines?: RecipeIngredientLine[];
  youtubeUrl?: string;
}

// Raw meal data fetched once; ingredient availability recomputed locally on pantry changes
export interface RawMealData {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  instructions: string;
  youtubeUrl: string;
  ingredientNames: string[];   // strIngredient1-20, non-empty, in order
  ingredientMeasures: string[]; // parallel array of strMeasure1-20
}

function normalize(name: string): string {
  return name.toLowerCase().trim();
}

function isSafeYoutubeUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function cleanInstructions(instructions: string, title: string): string {
  const cleaned = instructions
    .replace(/\r\n/g, '\n')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((step) => step.trim())
    .filter(Boolean)
    .join('\n');

  return cleaned || [
    `Prep the ingredients for ${title}.`,
    'Cook everything until hot and tender.',
    'Taste, season, and serve.',
  ].join('\n');
}

function recipeMatchesPantry(raw: RawMealData, availableNames: string[]): boolean {
  return raw.ingredientNames.some((ing) => {
    const req = normalize(ing);
    return availableNames.some((a) => a.includes(req) || req.includes(a));
  });
}

/** Recomputes have/missing flags from cached raw meal data — no API call. */
export function reEvaluateRecipes(raws: RawMealData[], pantryItems: PantryItem[]): RecipeSuggestion[] {
  const availableNames = pantryItems.map((item) => normalize(item.name));

  return raws
    .filter((raw) => recipeMatchesPantry(raw, availableNames))
    .map((raw) => {
      const matched: string[] = [];
      const missing: string[] = [];
      const ingredientLines: RecipeIngredientLine[] = [];

      raw.ingredientNames.forEach((ing, i) => {
        const req = normalize(ing);
        const have = availableNames.some((a) => a.includes(req) || req.includes(a));
        if (have) matched.push(ing); else missing.push(ing);
        ingredientLines.push({ name: ing, measure: raw.ingredientMeasures[i] ?? '', have });
      });

      const total = matched.length + missing.length;
      return {
        id: raw.id,
        title: raw.title,
        description: raw.description,
        matchedIngredients: matched,
        missingIngredients: missing,
        matchScore: total > 0 ? matched.length / total : 0,
        imageUrl: raw.imageUrl,
        instructions: cleanInstructions(raw.instructions, raw.title),
        ingredientLines,
        youtubeUrl: isSafeYoutubeUrl(raw.youtubeUrl) ? raw.youtubeUrl : '',
      } satisfies RecipeSuggestion;
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
}

const LOCAL_FALLBACK_RAWS: RawMealData[] = [
  {
    id: 'f1',
    title: 'Garlic Butter Pasta',
    description: 'A quick 15-minute pasta dish using pantry staples.',
    imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&q=80',
    instructions: 'Boil pasta until al dente.\nMelt butter in a pan over medium heat.\nAdd minced garlic and cook 1 minute.\nToss pasta with garlic butter.\nFinish with grated parmesan and black pepper.',
    youtubeUrl: '',
    ingredientNames: ['pasta', 'garlic', 'butter', 'parmesan'],
    ingredientMeasures: ['200g', '3 cloves', '2 tbsp', '50g'],
  },
  {
    id: 'f2',
    title: 'Chicken Stir Fry',
    description: 'Healthy and fast dinner using any vegetables you have.',
    imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&q=80',
    instructions: 'Slice chicken into strips.\nHeat oil in a wok over high heat.\nCook chicken 3-4 minutes until golden.\nAdd garlic and ginger, stir 30 seconds.\nAdd vegetables and soy sauce, toss 2-3 minutes.\nServe over rice.',
    youtubeUrl: '',
    ingredientNames: ['chicken', 'soy sauce', 'garlic', 'ginger', 'broccoli', 'rice'],
    ingredientMeasures: ['300g', '3 tbsp', '2 cloves', '1 tsp', '1 cup', '1 cup'],
  },
  {
    id: 'f3',
    title: 'Loaded Baked Potato',
    description: 'A flexible dinner with pantry toppings.',
    imageUrl: 'https://images.unsplash.com/photo-1607532941433-304659e8198a?w=400&q=80',
    instructions: 'Bake potato until tender.\nWarm beans or vegetables in a small pan.\nSplit potato and fluff the inside.\nTop with butter, cheese, beans, or vegetables.\nSeason and serve hot.',
    youtubeUrl: '',
    ingredientNames: ['potato', 'butter', 'cheese', 'beans'],
    ingredientMeasures: ['1 large', '1 tbsp', '30g', '1/2 cup'],
  },
];

/**
 * Fetches meal data from TheMealDB once and returns RawMealData[].
 * Call this only when the raw cache is empty; reuse the result for all future pantry re-evaluations.
 */
export async function fetchRawRecipes(pantryItems: PantryItem[]): Promise<RawMealData[]> {
  try {
    const availableNames = pantryItems.map((item) => normalize(item.name));
    if (availableNames.length === 0) return [];

    const mains = ['chicken', 'beef', 'pork', 'fish', 'salmon', 'egg', 'pasta', 'rice', 'potato', 'beans'];
    const prioritized = [
      ...availableNames.filter((name) => mains.some((m) => name.includes(m))),
      ...availableNames,
    ];
    const queryTerms = Array.from(new Set(prioritized))
      .slice(0, 5)
      .map((name) => name.replace(/\s+/g, '_'));
    const candidates = new Map<string, any>();

    for (const queryTerm of queryTerms) {
      const filterRes = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${queryTerm}`);
      if (!filterRes.ok) continue;
      const filterData = await filterRes.json();
      (filterData.meals ?? []).forEach((meal: any) => candidates.set(meal.idMeal, meal));
      if (candidates.size >= 12) break;
    }

    if (candidates.size === 0) return LOCAL_FALLBACK_RAWS;

    const shuffled = Array.from(candidates.values()).sort(() => 0.5 - Math.random());
    const raws: RawMealData[] = [];

    for (const meal of shuffled) {
      if (raws.length >= 3) break;
      const lookupRes = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`);
      if (!lookupRes.ok) continue;
      const lookupData = await lookupRes.json();
      const d = lookupData.meals?.[0];
      if (!d) continue;

      const ingredientNames: string[] = [];
      const ingredientMeasures: string[] = [];
      for (let i = 1; i <= 20; i++) {
        const ing = d[`strIngredient${i}`];
        if (ing && ing.trim()) {
          ingredientNames.push(ing.trim());
          ingredientMeasures.push((d[`strMeasure${i}`] ?? '').trim());
        }
      }

      raws.push({
        id: d.idMeal,
        title: d.strMeal,
        description: `${d.strArea || 'Global'} • ${d.strCategory || 'Dinner'}`,
        imageUrl: d.strMealThumb ?? '',
        instructions: cleanInstructions(d.strInstructions ?? '', d.strMeal),
        youtubeUrl: isSafeYoutubeUrl(d.strYoutube ?? '') ? d.strYoutube : '',
        ingredientNames,
        ingredientMeasures,
      });
    }

    return raws.length > 0 ? raws : LOCAL_FALLBACK_RAWS;
  } catch {
    return LOCAL_FALLBACK_RAWS;
  }
}

/** @deprecated use fetchRawRecipes + reEvaluateRecipes */
export async function suggestRecipes(pantryItems: PantryItem[]): Promise<RecipeSuggestion[]> {
  const raws = await fetchRawRecipes(pantryItems);
  return reEvaluateRecipes(raws, pantryItems);
}
