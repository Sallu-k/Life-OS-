import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { vaultRoot } from "./paths";
import { targets } from "../nutrition";

// Owner settings from _system/settings.md. `game: false` hides the game layer everywhere.
export interface Settings {
  game: boolean;
  goalBooks: number | null; // books to finish this year (Library reading panel)
  sleepBy: string; // the early-night target, "HH:MM" (Insights: early vs late nights)
  accent: string | null; // accent colour picked in Settings ("#3d7cf4"); null = the theme's default
  proteinTarget: number; // grams a day (Insights: days the target was reached)
}


export function loadSettings(): Settings {
  const file = path.join(vaultRoot(), "_system", "settings.md");
  try {
    const data = fs.existsSync(file) ? matter(fs.readFileSync(file, "utf8")).data : {};
    const goal = Number(data.reading?.goalBooks);
    const by = typeof data.sleep?.by === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(data.sleep.by) ? data.sleep.by : "23:00";
    const accent = typeof data.theme?.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(data.theme.accent) ? data.theme.accent : null;
    const n = data.nutrition && typeof data.nutrition === "object" ? data.nutrition : {};
    const pos = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);
    const proteinTarget = targets({ weight: pos(n.weight), protein: pos(n.protein), kcal: null }).protein;
    return { game: data.game !== false, goalBooks: Number.isInteger(goal) && goal > 0 ? goal : null, sleepBy: by, accent, proteinTarget };
  } catch {
    return { game: true, goalBooks: null, sleepBy: "23:00", accent: null, proteinTarget: targets(null).protein };
  }
}
