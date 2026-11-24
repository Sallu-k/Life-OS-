// Food: the day's protein and calories against the owner's targets (Build 26).
// Shared by the server (scripts/lib/days.mjs, settings.mjs: Node runs this .ts file directly, so only plain,
// erasable TypeScript here), the Today Food tab and the Insights page.

export interface Food {
  id: string;
  name: string;
  group: string;
  portion: string; // what "1" means: "1 plate (~200 g cooked)"
  kcal: number; // per portion (estimates)
  protein: number; // grams per portion
}
export interface Eaten {
  meal: string; // one of MEALS
  id: string; // a food id
  qty: number; // portions, in 0.5 steps
}
export interface NutritionSettings {
  weight: number | null; // kg; null = not set yet
  protein: number | null; // g a day; null = from the weight
  kcal: number | null; // a day; null = from the weight
}

export const MEALS = ["breakfast", "lunch", "snacks", "dinner"];

const ASSUMED_WEIGHT = 65; // until the weight is set in Settings

// Building muscle: 1.8 g protein per kg, and about 36 kcal per kg (a small surplus for an active person).
export function targets(n: NutritionSettings | null | undefined): { protein: number; kcal: number; weightSet: boolean } {
  const weight = n?.weight ?? ASSUMED_WEIGHT;
  return {
    protein: n?.protein ?? Math.round(weight * 1.8),
    kcal: n?.kcal ?? Math.round((weight * 36) / 50) * 50,
    weightSet: n?.weight != null,
  };
}

// The day's totals. Foods no longer in the list count as nothing.
export function totals(eaten: Eaten[], foods: Food[]): { protein: number; kcal: number } {
  const byId = new Map(foods.map((f) => [f.id, f]));
  let protein = 0;
  let kcal = 0;
  for (const e of eaten) {
    const f = byId.get(e.id);
    if (!f) continue;
    protein += f.protein * e.qty;
    kcal += f.kcal * e.qty;
  }
  return { protein: Math.round(protein), kcal: Math.round(kcal) };
}

// The meal that fits the time of day (where a new food goes by default).
export function mealNow(hour: number): string {
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 19) return "snacks";
  return "dinner";
}
