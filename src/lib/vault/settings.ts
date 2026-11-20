import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { vaultRoot } from "./paths";

// Owner settings from _system/settings.md. `game: false` hides the game layer everywhere.
export interface Settings {
  game: boolean;
  goalBooks: number | null; // books to finish this year (Library reading panel)
  sleepBy: string; // the early-night target, "HH:MM" (Insights: early vs late nights)
}


export function loadSettings(): Settings {
  const file = path.join(vaultRoot(), "_system", "settings.md");
  try {
    const data = fs.existsSync(file) ? matter(fs.readFileSync(file, "utf8")).data : {};
    const goal = Number(data.reading?.goalBooks);
    const by = typeof data.sleep?.by === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(data.sleep.by) ? data.sleep.by : "23:00";
    return { game: data.game !== false, goalBooks: Number.isInteger(goal) && goal > 0 ? goal : null, sleepBy: by };
  } catch {
    return { game: true, goalBooks: null, sleepBy: "23:00" };
  }
}
