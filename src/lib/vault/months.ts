import fs from "node:fs";
import path from "node:path";
import { vaultRoot } from "./paths";
import { once, parseNote } from "./read";
import type { GoalStatus, LoadResult, MonthNote } from "./types";
import { listLines } from "./daily";
import { section } from "./validate";

// The symbol in front of a goal tells how it went (as written by the journal import, or by hand in Obsidian).
const GOAL_MARKS: [RegExp, GoalStatus][] = [
  [/^☑/, "done"],
  [/^☒/, "not"],
  [/^◐/, "progress"],
  [/^☐/, "none"],
];

// "- ☑ done: Python Seminar" -> { status: "done", text: "Python Seminar" }
function readGoal(line: string): { status: GoalStatus; text: string } | null {
  const body = line.replace(/^\s*[-*+]\s+/, "").trim();
  if (body === "" || body.startsWith("(")) return null;
  const mark = GOAL_MARKS.find(([re]) => re.test(body));
  const text = body.replace(/^[☑☒◐☐]\s*[^:]*:\s*/, "").trim();
  return { status: mark ? mark[1] : "none", text: mark ? text : body };
}

// Reads Journal/YYYY-MM.md month notes (type: month). Only the Goals and Ideas sections leave this function.
export function loadMonthNotes(): LoadResult<MonthNote> {
  return once("months", readMonthNotes);
}

function readMonthNotes(): LoadResult<MonthNote> {
  const dir = path.join(vaultRoot(), "Journal");
  const warnings: string[] = [];
  if (!fs.existsSync(dir)) return { items: [], warnings };

  const items: MonthNote[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.md$/.test(f)).sort()) {
    const rel = path.join("Journal", file);
    let note;
    try {
      note = parseNote(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch {
      warnings.push(`${rel}: skipped, the frontmatter is not valid YAML`);
      continue;
    }
    if (note.data.type !== "month") continue;
    const lines = (name: string) => (section(note.content, name) ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");
    items.push({
      month: file.slice(0, 7),

      goals: lines("Goals").map(readGoal).filter((g): g is NonNullable<typeof g> => g !== null),
      ideas: listLines(section(note.content, "Ideas")),
      fun: listLines(section(note.content, "Fun")),
      books: listLines(section(note.content, "Books")),
    });
  }
  return { items, warnings };
}
