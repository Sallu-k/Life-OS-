// The Plan page's data: tasks on their dates (from the daily notes), the Someday list, and goals for the
// year, month and week. All plain Markdown the owner can also edit in Obsidian:
//   Daily/YYYY-MM-DD.md   ## Tasks  (a task's date is the day note it is in; ⚑ = deadline)
//   Tasks/Someday.md      ## Tasks  (no date yet)
//   Journal/YYYY.md       ## Goals  (year goals)
//   Journal/YYYY-MM.md    ## Goals  (month goals, also the monthly quests of the game layer)
//   Weekly/YYYY-Www.md    ## Goals  (week goals; the weekly review keeps its own sections)
// Goal lines: "- ☐ open: text", "- ◐ in progress: text", "- ☑ done: text", "- ☒ not achieved: text".
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { backup, blankNote, SOMEDAY, tasksIn } from "./days.mjs";
import { weekId } from "./tasks.mjs";
import { getSection, setSection } from "./notes.mjs";
import { vaultRoot } from "./vault-write.mjs";
import { weekOf } from "./review.mjs";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

// Dates (YYYY-MM-DD) that have a daily note from `from` to `to`.
function noteDates(from, to) {
  const dir = join(vaultRoot(), "Daily");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => f.slice(0, 10))
    .filter((d) => d >= from && d <= to)
    .sort();
}

// Week and month notes ("week:2026-W45", "month:2026-11") whose id is from `first` to `last`.
function bucketIds(first, last) {
  const ids = [];
  const weekly = join(vaultRoot(), "Weekly");
  if (existsSync(weekly))
    for (const f of readdirSync(weekly)) {
      const id = /^(\d{4}-W\d{2})\.md$/.exec(f)?.[1];
      if (id && id >= weekId(first) && id <= weekId(last)) ids.push(`week:${id}`);
    }
  const journal = join(vaultRoot(), "Journal");
  if (existsSync(journal))
    for (const f of readdirSync(journal)) {
      const id = /^(\d{4}-\d{2})\.md$/.exec(f)?.[1];
      if (id && id >= first.slice(0, 7) && id <= last.slice(0, 7)) ids.push(`month:${id}`);
    }
  return ids;
}

// Tasks from `from` to `to` (days, and weeks/months touching them), open tasks of the 60 days before
// (overdue: days, weeks and months that have ended), the Someday list and the goals `from` falls in.
export function getPlan(from, to) {
  if (!isDate(from) || !isDate(to) || to < from) throw new Error("plan: from and to must be dates, from first");
  if (to > addDays(from, 400)) throw new Error("plan: at most about a year at once");
  const tasks = [...noteDates(from, to), ...bucketIds(from, to)].flatMap((d) => tasksIn(d));
  const before = addDays(from, -1);
  const pastBuckets = bucketIds(addDays(from, -60), before).filter((b) => (b.startsWith("week:") ? b.slice(5) < weekId(from) : b.slice(6) < from.slice(0, 7)));
  const overdue = [...noteDates(addDays(from, -60), before), ...pastBuckets].flatMap((d) => tasksIn(d).filter((t) => !t.done));
  const year = from.slice(0, 4);
  const month = from.slice(0, 7);
  const week = weekOf(from).id;
  return {
    from,
    to,
    tasks,
    overdue,
    someday: tasksIn(SOMEDAY),
    goals: {
      year: { id: year, goals: readGoals("year", year) },
      month: { id: month, goals: readGoals("month", month) },
      week: { id: week, goals: readGoals("week", week) },
    },
  };
}

// ---------- goals ----------
const SCOPES = {
  year: { re: /^\d{4}$/, file: (id) => join(vaultRoot(), "Journal", `${id}.md`), type: "year" },
  month: { re: /^\d{4}-\d{2}$/, file: (id) => join(vaultRoot(), "Journal", `${id}.md`), type: "month" },
  week: { re: /^\d{4}-W\d{2}$/, file: (id) => join(vaultRoot(), "Weekly", `${id}.md`), type: "weekly" },
};
const MARKS = { none: "☐ open", progress: "◐ in progress", done: "☑ done", not: "☒ not achieved" };
const FROM_MARK = { "☐": "none", "◐": "progress", "☑": "done", "☒": "not" };

function scopeOf(scope, id) {
  const s = SCOPES[scope];
  if (!s) throw new Error("goals: scope must be year, month or week");
  if (!s.re.test(String(id))) throw new Error(`goals: ${scope} id looks wrong`);
  return s;
}

function readNote(file) {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  // Keep dates in the frontmatter as plain text (gray-matter would turn them into Date objects).
  return matter(raw.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)/, (_a, o, y, c) => o + y.replace(/^(\s*[\w-]+:[ \t]*)(\d{4}-\d{2}(?:-\d{2})?)[ \t]*$/gm, '$1"$2"') + c));
}

// "- ☑ done: Python Seminar" -> { status: "done", text: "Python Seminar" } (same reading as src/lib/vault/months.ts)
function readGoal(line) {
  const body = line.replace(/^\s*[-*+]\s+/, "").trim();
  if (body === "" || body.startsWith("(") || body.startsWith("<!--")) return null;
  const status = FROM_MARK[body[0]];
  const text = status ? body.replace(/^[☑☒◐☐]\s*[^:]*:\s*/, "").trim() : body;
  return text ? { status: status ?? "none", text } : null;
}

export function readGoals(scope, id) {
  const note = readNote(scopeOf(scope, id).file(id));
  if (!note) return [];
  return getSection(note.content, "Goals").split(/\r?\n/).map(readGoal).filter(Boolean);
}

// Replaces the goals of one year, month or week: [{ text, status }]. Other sections of the note stay as they are.
export function saveGoals(scope, id, goals) {
  const s = scopeOf(scope, id);
  if (!Array.isArray(goals)) throw new Error("goals: must be a list");
  const lines = goals
    .map((g) => ({ text: String(g?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200), status: MARKS[g?.status] ? g.status : "none" }))
    .filter((g) => g.text)
    .map((g) => `- ${MARKS[g.status]}: ${g.text}`);
  const file = s.file(id);
  const note = readNote(file) ?? blankNote(`${scope}:${id}`);
  note.content = setSection(note.content, "Goals", lines.join("\n"));
  if (!note.data.type) note.data.type = s.type;
  backup(file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, matter.stringify(`\n${note.content.replace(/^\s+/, "")}`, note.data));
  return readGoals(scope, id);
}
