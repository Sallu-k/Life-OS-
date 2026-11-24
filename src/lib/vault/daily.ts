import fs from "node:fs";
import path from "node:path";
import type matter from "gray-matter";
import { vaultRoot } from "./paths";
import { parseNote } from "./read";
import type { DailyRecord, HabitDefinition, HabitState, LoadResult } from "./types";
import { dateToString, isRealDate, section } from "./validate";

// "- [x] read", also "* [x] read" and "+ [ ] read" (Obsidian accepts all three bullets).
// [x] done, [/] half done, [o] showed up but not complete, [ ] not done, [-] not applicable.
// Top-level lines only: indented ones are a habit's parts (e.g. each meal of "Meals"); the
// habit's own line already carries the mark worked out from them.
const CHECKBOX = /^[-*+]\s*\[( |x|X|\/|o|O|-)\]\s+(\S+)\s*$/;
const MARKS: Record<string, HabitState> = { " ": "missed", x: "done", X: "done", "/": "half", o: "partial", O: "partial", "-": "na" };

// A non-negative number from the frontmatter (e.g. productivity: 20), or null.
function amount(value: unknown, key: string, rel: string, warnings: string[]): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  warnings.push(`${rel}: ${key} must be a number, 0 or more; ignored`);
  return null;
}
const KEEP = /^\s*>\s*keep:\s*(.*)$/i;

// Reads Daily/YYYY-MM-DD.md notes. PRIVACY: only habit states, "> keep:" lines, the frontmatter
// numbers (incl. the Food tab's protein total, never the "## Food" list) and the "## Fun" list leave this function.
// The journal text is never returned, stored or logged.
export function loadDaily(habits: HabitDefinition[]): LoadResult<DailyRecord> {
  const dir = path.join(vaultRoot(), "Daily");
  const warnings: string[] = [];
  if (!fs.existsSync(dir)) {
    warnings.push(`Folder not found: ${dir}`);
    return { items: [], warnings };
  }

  const known = new Set(habits.map((h) => h.id));
  const items: DailyRecord[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md"))) {
    const rel = path.join("Daily", file);
    const date = file.replace(/\.md$/i, "");
    if (!isRealDate(date)) {
      warnings.push(`${rel}: filename must be a real date like 2026-03-14.md; skipped`);
      continue;
    }

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = parseNote(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch {
      warnings.push(`${rel}: skipped, the frontmatter is not valid YAML`);
      continue;
    }
    const fmDate = dateToString(parsed.data.date);
    if (fmDate !== undefined && fmDate !== null && fmDate !== date) {
      warnings.push(`${rel}: frontmatter date "${String(fmDate)}" differs from the filename; the filename is used`);
    }

    items.push({
      date,
      habits: readHabits(section(parsed.content, "Habits"), known, rel, warnings),
      keepLines: readKeepLines(parsed.content),
      productivity: amount(parsed.data.productivity, "productivity", rel, warnings),
      screenTime: amount(parsed.data.screen_time_hours, "screen_time_hours", rel, warnings),
      pages: amount(parsed.data.pages_read, "pages_read", rel, warnings),
      fun: listLines(section(parsed.content, "Fun")),
      ...taskCounts(section(parsed.content, "Tasks")),
      mood: amount(parsed.data.mood, "mood", rel, warnings),
      sleep: amount(parsed.data.sleep_hours, "sleep_hours", rel, warnings),
      bedtime: clock(parsed.data.bedtime),
      boredMin: amount(parsed.data.bored_min, "bored_min", rel, warnings),
      protein: amount(parsed.data.protein_g, "protein_g", rel, warnings),
      missed: reasons(parsed.data.missed),
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return { items, warnings };
}

// Reasons a habit was not done (frontmatter `missed: { habit-id: reason }`), only known short words.
const REASONS = new Set(["tired", "busy", "travel", "forgot", "sick", "other"]);
function reasons(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, r]) => typeof r === "string" && REASONS.has(r)) as [string, string][]);
}

// Only the "## Habits" section is read. Duplicates count as unrecorded; unknown ids are ignored.
function readHabits(text: string | null, known: Set<string>, rel: string, warnings: string[]): Record<string, HabitState> {
  const states: Record<string, HabitState> = {};
  const seen = new Set<string>();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = CHECKBOX.exec(line);
    if (!m) continue;
    const id = m[2].toLowerCase();
    if (!known.has(id)) {
      warnings.push(`${rel}: unknown habit id "${id}"; ignored`);
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`${rel}: habit "${id}" is listed more than once; counted as unrecorded`);
      states[id] = "unrecorded";
      continue;
    }
    seen.add(id);
    states[id] = MARKS[m[1]];
  }
  return states;
}

// How many tasks were completed (and how many of those were high priority). Never the task text.
function taskCounts(text: string | null): { tasksDone: number; tasksHigh: number } {
  let tasksDone = 0;
  let tasksHigh = 0;
  for (const line of (text ?? "").split(/\r?\n/)) {
    if (!/^\s*[-*+]\s*\[[xX]\]/.test(line)) continue;
    tasksDone++;
    if (line.includes("⏫")) tasksHigh++;
  }
  return { tasksDone, tasksHigh };
}

// The items of a short list section ("- Trip to the beach"), without bullets. Empty lines are skipped.
export function listLines(text: string | null): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*+])\s+/, "").trim())
    .filter((l) => l !== "" && !l.startsWith("("));
}

function readKeepLines(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = KEEP.exec(line);
    if (m && m[1].trim() !== "") out.push(m[1].trim());
  }
  return out;
}

// "HH:MM", or null. YAML reads an unquoted 23:10 as the number 1390 (base 60), so that is turned back.
function clock(v: unknown): string | null {
  const s = typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1440 ? `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}` : v;
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
}
