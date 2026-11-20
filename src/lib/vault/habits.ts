import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { vaultRoot } from "./paths";
import type { HabitDefinition, LoadResult } from "./types";
import { areaId, level } from "./validate";

// Reads the habit list from _system/habits.md. Ids are permanent; labels can change.
export function loadHabitDefinitions(): LoadResult<HabitDefinition> {
  const rel = path.join("_system", "habits.md");
  const file = path.join(vaultRoot(), rel);
  const warnings: string[] = [];
  if (!fs.existsSync(file)) {
    warnings.push(`File not found: ${file}`);
    return { items: [], warnings };
  }

  let raw: unknown;
  try {
    raw = matter(fs.readFileSync(file, "utf8")).data.habits;
  } catch {
    warnings.push(`${rel}: the frontmatter is not valid YAML; no habits loaded`);
    return { items: [], warnings };
  }
  if (!Array.isArray(raw)) {
    warnings.push(`${rel}: "habits" must be a list`);
    return { items: [], warnings };
  }

  const items: HabitDefinition[] = [];
  raw.forEach((h: unknown, i: number) => {
    const entry = (h ?? {}) as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!/^[a-z0-9-]+$/.test(id)) {
      warnings.push(`${rel}: habit #${i + 1} needs an id in lowercase letters, numbers or dashes; skipped`);
      return;
    }
    if (items.some((x) => x.id === id)) {
      warnings.push(`${rel}: habit id "${id}" is listed twice; second one skipped`);
      return;
    }
    const label = typeof entry.label === "string" && entry.label.trim() !== "" ? entry.label.trim() : id;
    if (entry.active !== undefined && typeof entry.active !== "boolean") {
      warnings.push(`${rel}: habit "${id}" active must be true or false; treated as true`);
    }
    const active = entry.active !== false;
    const problems: string[] = [];
    const area = areaId(entry, problems);
    const habitLevel = level(entry, problems);
    for (const p of problems) warnings.push(`${rel}: habit "${id}" ${p}`);
    const difficulty = ["easy", "medium", "hard"].includes(String(entry.difficulty)) ? (entry.difficulty as "easy" | "medium" | "hard") : null;
    const core = entry.core === true;
    const weekly = core && Number.isInteger(Number(entry.weekly)) ? Math.max(1, Math.min(7, Number(entry.weekly))) : core ? 5 : null;
    items.push({ id, label, active, area, level: habitLevel, difficulty, days: dayList(entry.days), core, weekly });
  });
  return { items, warnings };
}

// "weekdays" / "weekends" / [mon, wed] / "mon, wed" -> a list of mon..sun; daily or empty -> null (every day).
const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
function dayList(v: unknown): string[] | null {
  if (v === null || v === undefined || v === "" || v === "daily") return null;
  if (v === "weekdays") return WEEK.slice(0, 5);
  if (v === "weekends") return WEEK.slice(5);
  const list = (Array.isArray(v) ? v : String(v).split(",")).map((x) => String(x).trim().toLowerCase().slice(0, 3)).filter((x) => WEEK.includes(x));
  return list.length === 0 || list.length === 7 ? null : list;
}
