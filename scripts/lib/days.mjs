// The Today screen's data: habits (definitions + today's marks), tasks, numbers, journal and capture.
// Everything is stored in plain Markdown the owner can also edit in Obsidian:
//   _system/habits.md          habit list with days, time, difficulty, target, area
//   Daily/YYYY-MM-DD.md        ## Habits (- [x] id), ## Tasks (- [ ] text ⏰ 18:00 ⏫), ## Fun, ## Journal, > keep:
//   Inbox/Inbox.md             quick notes, one line each under a date
//   Brainstorm/<slug>.md       ideas, from the Brainstorm template
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { getItem, getSection, listItems, setSection, updateItem } from "./notes.mjs";
import { slugify, today, vaultRoot } from "./vault-write.mjs";
import { changeTime, checkRecordChange, isFuture, lockTime, MISSED_REASONS, stamp } from "./dayRules.mjs";
import { pcHours } from "./usage.mjs";
import { readFoods } from "./foods.mjs";
import { MEALS, totals } from "../../src/lib/nutrition.ts"; // shared with the app (Node runs .ts directly)
import { cleanTask, nextRepeat, parseTasks, taskLines, weekId, weekMonday } from "./tasks.mjs";

const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MARK_TO_STATE = { x: "done", X: "done", "/": "half", o: "partial", O: "partial", " ": "missed", "-": "na" };
const STATE_TO_MARK = { done: "x", half: "/", partial: "o", missed: " ", na: "-" };

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
function checkDate(d) {
  if (!isDate(d)) throw new Error("date: must be YYYY-MM-DD");
  return d;
}

function parse(raw) {
  const text = raw.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)/, (_a, o, y, c) => o + y.replace(/^(\s*[\w-]+:[ \t]*)(\d{4}-\d{2}-\d{2})[ \t]*$/gm, '$1"$2"') + c);
  return matter(text);
}

export function backup(file) {
  if (!existsSync(file)) return;
  const rel = file.slice(vaultRoot().length + 1);
  const dest = join(vaultRoot(), ".lifeos-backup", today(), `${Date.now()}-${rel.replace(/[\\/]/g, "__")}`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
}

// ---------- habit definitions ----------
const habitsFile = () => join(vaultRoot(), "_system", "habits.md");

export function readHabits() {
  if (!existsSync(habitsFile())) return [];
  const list = parse(readFileSync(habitsFile(), "utf8")).data.habits;
  return (Array.isArray(list) ? list : []).filter((h) => h && typeof h.id === "string");
}

// Days a habit is due: "daily" (default), "weekdays", "weekends" or a list like [mon, wed, fri].
export function dueOn(habit, date) {
  const day = WEEK[new Date(`${date}T12:00:00`).getDay()];
  const d = habit.days;
  if (!d || d === "daily") return true;
  if (d === "weekdays") return !["sat", "sun"].includes(day);
  if (d === "weekends") return ["sat", "sun"].includes(day);
  const list = Array.isArray(d) ? d : String(d).split(",");
  return list.map((x) => String(x).trim().toLowerCase().slice(0, 3)).includes(day);
}

const DIFFICULTY = ["easy", "medium", "hard"];
const MARK_ORDER = ["done", "half", "partial", "missed"];
// Replaces the habit list. Ids are kept permanent: an id that exists keeps its history; new ids are added.
export function writeHabits(list) {
  if (!Array.isArray(list)) throw new Error("habits: must be a list");
  const seen = new Set();
  const clean = list.map((h, i) => {
    const id = slugify(String(h.id || h.label || ""));
    if (!id) throw new Error(`habit ${i + 1}: needs a name`);
    if (seen.has(id)) throw new Error(`habit "${id}" is listed twice`);
    seen.add(id);
    const out = { id, label: String(h.label || id).trim(), active: h.active !== false };
    if (h.area) out.area = String(h.area);
    if (h.level) out.level = Number(h.level);
    if (h.days && h.days !== "daily") out.days = Array.isArray(h.days) ? h.days : String(h.days);
    if (h.time && /^\d{2}:\d{2}$/.test(h.time)) out.time = h.time;
    if (DIFFICULTY.includes(h.difficulty)) out.difficulty = h.difficulty;
    if (h.target) out.target = String(h.target).trim();
    // Which marks the habit offers (default: done, half, showed up, not done; "not applicable" is always there).
    if (Array.isArray(h.marks)) {
      const marks = MARK_ORDER.filter((m) => h.marks.includes(m));
      if (marks.length && marks.length < MARK_ORDER.length) out.marks = marks;
    }
    // Counted: an amount a day (e.g. pages), with an optional daily goal.
    if (h.unit) {
      out.unit = String(h.unit).trim().slice(0, 12);
      const goal = Number(h.goal);
      if (Number.isInteger(goal) && goal > 0 && goal <= 1000) out.goal = goal;
    }
    // Parts, each at an anchor of your day (e.g. one per meal); the habit's mark follows them.
    if (Array.isArray(h.parts) && h.parts.length) {
      out.parts = h.parts.slice(0, 12).map((p, j) => {
        const pid = slugify(String(p.id || p.label || ""));
        if (!pid) throw new Error(`habit "${id}": part ${j + 1} needs a name`);
        const off = Number(p.offset);
        return {
          id: pid,
          label: String(p.label || pid).trim(),
          ...(typeof p.anchor === "string" && /^[a-z0-9-]{1,60}$/.test(p.anchor) ? { anchor: p.anchor } : {}),
          ...(Number.isInteger(off) && off !== 0 ? { offset: Math.max(-180, Math.min(180, off)) } : {}),
        };
      });
      const pm = Array.isArray(h.partMarks) ? ["done", "half", "missed"].filter((m) => h.partMarks.includes(m)) : [];
      if (pm.length) out.partMarks = pm;
    }
    // A core habit counts double XP and has a weekly target (days out of 7) instead of a streak.
    if (h.core === true) {
      out.core = true;
      const weekly = Number(h.weekly ?? 5);
      out.weekly = Number.isInteger(weekly) ? Math.max(1, Math.min(7, weekly)) : 5;
    }
    if (h.remind === false) out.remind = false; // placed in the routine only (Today's order), no reminder
    // Follows an anchor (Settings, "Your day"): remind `offset` minutes after that anchor's time.
    if (typeof h.after === "string" && /^[a-z0-9-]{1,60}$/.test(h.after)) {
      out.after = h.after;
      const offset = Number(h.offset ?? 0);
      out.offset = Number.isFinite(offset) ? Math.max(-120, Math.min(240, Math.round(offset))) : 0;
    }
    return out;
  });
  const file = habitsFile();
  const note = existsSync(file) ? parse(readFileSync(file, "utf8")) : { data: { type: "habits" }, content: "" };
  backup(file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, matter.stringify(note.content || "\nHabit ids are permanent. Rename by changing `label` only.\n", { ...note.data, habits: clean }));
  return readHabits();
}

// ---------- daily note, and the other places a task can live ----------
// A task's "date" is where it lives: a day "YYYY-MM-DD" (Daily/), "week:2026-W45" (Weekly/, any day that
// week), "month:2026-11" (Journal/, any day that month) or "someday" (Tasks/Someday.md, no date yet).
export const SOMEDAY = "someday";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const isPlace = (w) => isDate(w) || w === SOMEDAY || /^week:\d{4}-W\d{2}$/.test(w) || /^month:\d{4}-\d{2}$/.test(w);
export function notePath(where) {
  if (where === SOMEDAY) return join(vaultRoot(), "Tasks", "Someday.md");
  if (String(where).startsWith("week:")) return join(vaultRoot(), "Weekly", `${where.slice(5)}.md`);
  if (String(where).startsWith("month:")) return join(vaultRoot(), "Journal", `${where.slice(6)}.md`);
  return join(vaultRoot(), "Daily", `${checkDate(where)}.md`);
}
// A new note for a place that has none yet (also used for year/month/week goals, scripts/lib/plan.mjs).
export function blankNote(where) {
  if (where === SOMEDAY) return { data: { type: "tasks" }, content: "\n# Someday\n\nTasks without a date. Give one a date on the Plan page to move it to that day.\n\n## Tasks\n" };
  if (where.startsWith("week:")) return { data: { type: "weekly", week: where.slice(5) }, content: `# Week ${where.slice(5)}\n` };
  if (where.startsWith("month:")) {
    const id = where.slice(6);
    return { data: { type: "month", month: id }, content: `# ${MONTHS[Number(id.slice(5)) - 1]} ${id.slice(0, 4)}\n` };
  }
  if (where.startsWith("year:")) return { data: { type: "year", year: where.slice(5) }, content: `# ${where.slice(5)}\n` };
  return { data: { type: "daily", date: where }, content: "\n## Habits\n\n## Tasks\n\n## Journal\n" };
}
const dayFile = notePath;

function readDay(where) {
  if (!isPlace(where)) throw new Error("task: date must be YYYY-MM-DD, week:YYYY-Www, month:YYYY-MM or someday");
  const file = notePath(where);
  return existsSync(file) ? parse(readFileSync(file, "utf8")) : blankNote(where);
}

function writeDay(where, note) {
  const file = notePath(where);
  backup(file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, matter.stringify(`\n${note.content.replace(/^\s+/, "")}`, note.data));
}

// Tasks are written in Obsidian Tasks style (see scripts/lib/tasks.mjs).
export { nextRepeat };

// The tasks of a place, with their position in its list.
export function tasksIn(where) {
  return tasksOf(readDay(where)).map((t, index) => ({ ...t, index, date: where }));
}
function tasksOf(note) {
  return parseTasks(getSection(note.content, "Tasks"));
}
function setTasks(note, tasks) {
  note.content = setSection(note.content, "Tasks", tasks.map((t) => taskLines(t, today())).join("\n"));
}

// "## Habits": one line per habit; a habit with parts has them on indented lines under it:
//   - [/] meals
//     - [x] breakfast
//     - [/] lunch
function habitLines(note) {
  const states = {};
  const parts = {};
  let parent = null;
  for (const line of getSection(note.content, "Habits").split(/\r?\n/)) {
    const m = /^(\s*)[-*+]\s*\[( |x|X|\/|o|O|-)\]\s+(\S+)\s*$/.exec(line);
    if (!m) continue;
    const id = m[3].toLowerCase();
    if (!m[1]) {
      states[id] = MARK_TO_STATE[m[2]];
      parent = id;
    } else if (parent) (parts[parent] ??= {})[id] = MARK_TO_STATE[m[2]];
  }
  return { states, parts };
}
const habitStates = (note) => habitLines(note).states;

// ---------- habit kinds: marks allowed, an amount (pages), or parts (one per anchor) ----------
const PART_VALUE = { done: 1, half: 0.5, partial: 0.25, missed: 0 };
// The habit's own mark from its parts: all done -> done, half or more -> half, any -> showed up, none -> not done.
// Parts not marked yet count as not done (so 3 of 5 parts is "half", not "done").
export function markFromParts(partStates, defs) {
  const counted = defs.filter((d) => partStates[d.id] !== "na");
  if (!counted.some((d) => partStates[d.id])) return null;
  const avg = counted.reduce((s, d) => s + (PART_VALUE[partStates[d.id]] ?? 0), 0) / counted.length;
  return avg >= 1 ? "done" : avg >= 0.5 ? "half" : avg > 0 ? "partial" : "missed";
}
// The habit's own mark from an amount: the goal reached -> done, half of it -> half, some -> showed up.
// Without a goal, any amount is done.
export function markFromAmount(amount, goal) {
  if (amount === null || amount === undefined) return null;
  if (!goal) return amount > 0 ? "done" : "missed";
  return amount >= goal ? "done" : amount >= goal / 2 ? "half" : amount > 0 ? "partial" : "missed";
}

// The journal is the "## Journal" section without the keep line, which is kept separately.
function journalOf(note) {
  const text = getSection(note.content, "Journal");
  const keep = /^\s*>\s*keep:\s*(.*)$/im.exec(note.content)?.[1]?.trim() ?? "";
  const body = text
    .split(/\r?\n/)
    .filter((l) => !/^\s*>\s*keep:/i.test(l) && l.trim() !== "(private: the website never shows this)")
    .join("\n")
    .trim();
  return { journal: body, keep };
}

// "## Food": what was eaten, one line each: "- lunch 1.5 rice-plate" (meal, portions, food id from
// _system/foods.md). Private like the journal: only the live Food tab shows it.
const FOOD_LINE = /^\s*[-*+]\s+([a-z]+)\s+(\d+(?:\.\d+)?)\s+([a-z0-9][a-z0-9-]{0,59})\s*$/;
function foodOf(note) {
  const out = [];
  for (const line of getSection(note.content, "Food").split(/\r?\n/)) {
    const m = FOOD_LINE.exec(line);
    if (m && MEALS.includes(m[1])) out.push({ meal: m[1], id: m[3], qty: Number(m[2]) });
  }
  return out;
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
// "HH:MM", or null. YAML reads an unquoted 23:10 as the number 1390 (base 60), so that is turned back.
const hhmm = (v) => {
  const s = typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1440 ? `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}` : v;
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
};

export function getDay(date) {
  checkDate(date);
  const note = readDay(date);
  const { states, parts } = habitLines(note);
  const amounts = note.data.amounts && typeof note.data.amounts === "object" ? note.data.amounts : {};
  const habits = readHabits()
    .filter((h) => h.active !== false || states[h.id])
    .map((h) => ({ ...h, due: dueOn(h, date), state: states[h.id] ?? null, partStates: parts[h.id] ?? {}, amount: num(amounts[h.id]) }));
  const { journal, keep } = journalOf(note);
  const now = stamp();
  const lockAt = lockTime(date, note.data);
  return {
    date,
    exists: existsSync(dayFile(date)),
    // The honest-record rules (scripts/lib/dayRules.mjs): finished/locked days, future days, entry times.
    finished: note.data.finished ?? null,
    lockAt,
    locked: now >= lockAt,
    future: isFuture(date, now),
    logged: note.data.logged && typeof note.data.logged === "object" ? note.data.logged : {},
    mood: num(note.data.mood),
    // Measured screen time: the PC's (live until the day closes, then saved in the note) and the phone's.
    pcHours: num(note.data.screen_pc_hours) ?? pcHours(date),
    phoneHours: num(note.data.screen_phone_hours),
    // Bored time: the longest stretch the phone stayed off between 08:00 and 22:00 (measured by the phone).
    boredMin: num(note.data.bored_min),
    // Books being read, so pages read today can move the right book forward.
    reading: readingBooks(),
    pagesBook: typeof note.data.pages_book === "string" ? note.data.pages_book : null,
    sleep: num(note.data.sleep_hours),
    // Measured by the phone (scripts/lib/days.mjs recordSleep): bedtime on the evening's note, wake time
    // on the morning's. `played`: minutes of reward time used that day (Today's reward time card).
    bedtime: hhmm(note.data.bedtime),
    woke: hhmm(note.data.woke),
    played: num(note.data.played_min) ?? 0,
    missed: note.data.missed && typeof note.data.missed === "object" ? note.data.missed : {},
    habits,
    tasks: tasksOf(note).map((t, index) => ({ ...t, index, date })),
    carried: carriedTasks(date),
    productivity: num(note.data.productivity),
    screenTime: num(note.data.screen_time_hours),
    pages: num(note.data.pages_read),
    journal,
    keep,
    food: foodOf(note),
    protein: num(note.data.protein_g),
    kcal: num(note.data.kcal),
    fun: getSection(note.content, "Fun").split(/\r?\n/).map((l) => l.replace(/^\s*[-*+]\s+/, "").trim()).filter((l) => l && !l.startsWith("<!--")),
  };
}

// When a day closes: keep the PC's measured hours in the note, and if no screen time was typed in,
// use PC + phone as the day's screen time.
function closeScreenTime(data, date) {
  const pc = pcHours(date);
  if (pc !== null) data.screen_pc_hours = pc;
  const phone = num(data.screen_phone_hours);
  if (num(data.screen_time_hours) === null && (pc !== null || phone !== null)) data.screen_time_hours = Math.round(((pc ?? 0) + (phone ?? 0)) * 10) / 10;
}

// Called every hour by the server: the last few days that have closed by themselves (noon the next day)
// get their measured screen time saved once.
export function closeFinishedDays() {
  const now = stamp();
  for (let i = 1; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!existsSync(dayFile(date)) && pcHours(date) === null) continue;
    const note = readDay(date);
    if (now < lockTime(date, note.data) || note.data.screen_pc_hours !== undefined || pcHours(date) === null) continue;
    closeScreenTime(note.data, date);
    note.data.type = "daily";
    note.data.date = date;
    writeDay(date, note);
  }
}

// The offline pack reads hundreds of days at once: it lists the books once (~60 ms each time) and reads
// each day's tasks once (every day looks at the 14 before it). Safe because the pack runs in one go,
// with no other request in between.
let once = null;
export function readOnce(run) {
  once = { books: readingBooks(), tasks: new Map() };
  try {
    return run();
  } finally {
    once = null;
  }
}

function readingBooks() {
  if (once) return once.books;
  try {
    return listItems("books")
      .filter((b) => b.status === "reading")
      .map((b) => ({ slug: b.slug, title: b.title, progress: num(b.progress) ?? 0, pages: num(b.pages) }));
  } catch {
    return [];
  }
}

// Pages read on a day move that book's current page forward. Changing the number later only applies the
// difference; switching the book moves the pages from one book to the other. Reaching the last page
// marks the book finished.
function movePages(slug, delta, date) {
  if (!slug || !delta) return;
  const book = getItem("books", slug);
  if (!book) return;
  const progress = Math.max(0, (num(book.progress) ?? 0) + delta);
  const pages = num(book.pages);
  const changes = { progress };
  if (pages && progress >= pages && book.status !== "finished") Object.assign(changes, { progress: pages, status: "finished", finished: date.slice(0, 7) });
  updateItem("books", slug, changes);
}

// Unfinished tasks from the 14 days before `date`, so nothing pending is forgotten.
function carriedTasks(date) {
  const dir = join(vaultRoot(), "Daily");
  if (!existsSync(dir)) return [];
  const since = new Date(new Date(`${date}T12:00:00`).getTime() - 14 * 864e5).toISOString().slice(0, 10);
  const out = [];
  for (const f of readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort()) {
    const d = f.slice(0, 10);
    if (d < since || d >= date) continue;
    const tasks = once?.tasks.get(f) ?? tasksOf(parse(readFileSync(join(dir, f), "utf8")));
    once?.tasks.set(f, tasks);
    tasks.forEach((t, index) => !t.done && out.push({ ...t, index, date: d }));
  }
  return out;
}

// Applies changes to a day: { habits: {id: state|null}, missed: {id: reason|null}, mood, sleep, productivity,
// screenTime, pages, journal, keep, fun: [..], finish: true } plus `at` (when it was done on the device) and
// `unlock` (the owner unlocked a finished day to change it).
const RECORD_KEYS = ["habits", "parts", "amounts", "missed", "mood", "sleep", "productivity", "screenTime", "pages", "journal", "keep", "fun", "food", "finish"];
export function updateDay(date, changes) {
  const note = readDay(date);
  const at = changeTime(changes.at);
  if (RECORD_KEYS.some((k) => k in changes)) checkRecordChange(date, note.data, at, changes.unlock === true);
  // When each thing was first logged (kept, so a later correction does not hide when it was first entered).
  const logged = note.data.logged && typeof note.data.logged === "object" ? { ...note.data.logged } : {};
  const mark = (key) => {
    if (!logged[key]) logged[key] = at;
  };
  const pagesBefore = num(note.data.pages_read) ?? 0; // read before the numbers below are updated
  if (changes.habits || changes.parts || changes.amounts) {
    // Ids end up as lines in the note: only plain habit ids (no line breaks or other text can sneak in).
    for (const group of [changes.habits, changes.parts, changes.amounts])
      for (const id of Object.keys(group ?? {})) if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(id)) throw new Error(`habits: bad id "${id.slice(0, 20)}"`);
    const defs = readHabits();
    const byId = new Map(defs.map((h) => [h.id, h]));
    const { states, parts } = habitLines(note);
    Object.assign(states, changes.habits ?? {});
    // Parts { habitId: { partId: state|null } }: the habit's own mark follows them.
    for (const [id, changed] of Object.entries(changes.parts ?? {})) {
      const partDefs = byId.get(id)?.parts;
      if (!Array.isArray(partDefs) || !changed || typeof changed !== "object") throw new Error(`parts: "${id}" has no parts`);
      const next = { ...(parts[id] ?? {}) };
      for (const [part, state] of Object.entries(changed)) {
        if (!partDefs.some((d) => d.id === part)) throw new Error(`parts: "${id}" has no part "${part}"`);
        if (state !== null && STATE_TO_MARK[state] === undefined) throw new Error(`parts: unknown mark "${state}"`);
        if (state) next[part] = state;
        else delete next[part];
      }
      parts[id] = next;
      states[id] = markFromParts(next, partDefs);
    }
    // Amounts { habitId: number|null } (e.g. pages of a book): kept in the frontmatter; the mark follows.
    const amounts = note.data.amounts && typeof note.data.amounts === "object" ? { ...note.data.amounts } : {};
    for (const [id, value] of Object.entries(changes.amounts ?? {})) {
      const v = num(value);
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1000)) throw new Error("amounts: a number from 0 to 1000");
      if (v === null) delete amounts[id];
      else amounts[id] = v;
      states[id] = markFromAmount(v, num(byId.get(id)?.goal));
    }
    note.data.amounts = Object.keys(amounts).length ? amounts : undefined;
    for (const id of [...Object.keys(changes.habits ?? {}), ...Object.keys(changes.parts ?? {}), ...Object.keys(changes.amounts ?? {})]) if (states[id]) mark(id);
    const order = defs.map((h) => h.id);
    const ids = [...order.filter((id) => id in states), ...Object.keys(states).filter((id) => !order.includes(id))];
    const lines = [];
    for (const id of ids) {
      if (!states[id] || STATE_TO_MARK[states[id]] === undefined) continue;
      lines.push(`- [${STATE_TO_MARK[states[id]]}] ${id}`);
      for (const d of byId.get(id)?.parts ?? []) if (parts[id]?.[d.id]) lines.push(`  - [${STATE_TO_MARK[parts[id][d.id]]}] ${d.id}`);
    }
    note.content = setSection(note.content, "Habits", lines.join("\n"));
  }
  for (const [key, field, max] of [["productivity", "productivity", 100], ["screenTime", "screen_time_hours", 24], ["pages", "pages_read", 5000], ["sleep", "sleep_hours", 24], ["mood", "mood", 5]]) {
    if (key in changes) {
      const v = num(changes[key]);
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > max)) throw new Error(`${key}: must be a number from 0 to ${max}`);
      if (key === "mood" && v !== null && (v < 1 || !Number.isInteger(v))) throw new Error("mood: 1 to 5");
      note.data[field] = v;
      if (v !== null) mark(key);
    }
  }
  if ("pages" in changes) {
    const before = pagesBefore;
    const oldBook = typeof note.data.pages_book === "string" ? note.data.pages_book : null;
    const newBook = "pagesBook" in changes ? changes.pagesBook || null : oldBook;
    const after = num(changes.pages) ?? 0;
    if (oldBook && oldBook !== newBook) movePages(oldBook, -before, date);
    movePages(newBook, oldBook === newBook ? after - before : after, date);
    note.data.pages_book = newBook ?? undefined;
  }
  if (changes.missed && typeof changes.missed === "object") {
    const missed = note.data.missed && typeof note.data.missed === "object" ? { ...note.data.missed } : {};
    for (const [id, reason] of Object.entries(changes.missed)) {
      if (reason === null) delete missed[id];
      else if (MISSED_REASONS.includes(reason)) missed[id] = reason;
      else throw new Error(`missed: reason must be one of ${MISSED_REASONS.join(", ")}`);
    }
    note.data.missed = Object.keys(missed).length ? missed : undefined;
  }
  // The phone sends its measured screen time (allowed on closed days too: it is measured, not entered).
  if ("phoneHours" in changes) {
    const v = num(changes.phoneHours);
    if (v !== null && Number.isFinite(v) && v >= 0 && v <= 24) note.data.screen_phone_hours = Math.round(v * 10) / 10;
  }
  if ("boredMin" in changes) {
    const v = num(changes.boredMin);
    if (v !== null && Number.isInteger(v) && v >= 0 && v <= 840) note.data.bored_min = v;
  }
  // Bed and wake times (measured by the phone, or corrected by hand) and reward time used: allowed on
  // closed days too, like phoneHours (they are measurements and a spending log, not the day's record).
  for (const [key, field] of [["bedtime", "bedtime"], ["woke", "woke"]])
    if (key in changes) {
      if (changes[key] !== null && !hhmm(changes[key])) throw new Error(`${key}: must be HH:MM`);
      note.data[field] = changes[key] ?? undefined;
    }
  if ("played" in changes) {
    const v = num(changes.played);
    if (v === null || !Number.isInteger(v) || v < 0 || v > 1440) throw new Error("played: minutes from 0 to 1440");
    note.data.played_min = v || undefined;
  }
  if (changes.finish === true && !note.data.finished) {
    note.data.finished = at;
    closeScreenTime(note.data, date);
  }
  // Food: the whole list for the day; the totals go in the frontmatter (Insights and the weekly review read only those).
  if ("food" in changes) {
    if (!Array.isArray(changes.food) || changes.food.length > 100) throw new Error("food: must be a list");
    const known = new Set(readFoods().map((f) => f.id));
    const food = changes.food.map((e) => {
      const qty = Number(e?.qty);
      if (!MEALS.includes(e?.meal)) throw new Error(`food: meal must be one of ${MEALS.join(", ")}`);
      if (!known.has(e?.id)) throw new Error(`food: unknown food "${String(e?.id).slice(0, 20)}"`);
      if (!Number.isFinite(qty) || qty < 0.5 || qty > 20 || qty * 2 !== Math.round(qty * 2)) throw new Error("food: portions from 0.5 to 20, in halves");
      return { meal: e.meal, id: e.id, qty };
    });
    note.content = setSection(note.content, "Food", food.map((e) => `- ${e.meal} ${e.qty} ${e.id}`).join("\n"));
    const sum = totals(food, readFoods());
    note.data.protein_g = food.length ? sum.protein : undefined;
    note.data.kcal = food.length ? sum.kcal : undefined;
    if (food.length) mark("food");
  }
  if ("fun" in changes) mark("fun");
  if ("journal" in changes || "keep" in changes) mark("journal");
  if ("fun" in changes) note.content = setSection(note.content, "Fun", (changes.fun ?? []).filter(Boolean).map((l) => `- ${String(l).trim()}`).join("\n"));
  if ("journal" in changes || "keep" in changes) {
    const current = journalOf(note);
    const journal = "journal" in changes ? String(changes.journal ?? "") : current.journal;
    const keep = "keep" in changes ? String(changes.keep ?? "").trim() : current.keep;
    note.content = note.content.replace(/^\s*>\s*keep:.*$/gim, "");
    note.content = setSection(note.content, "Journal", `${journal.trim()}${keep ? `\n\n> keep: ${keep}` : ""}`);
  }
  note.data.type = "daily";
  note.data.date = date;
  if (Object.keys(logged).length) note.data.logged = logged;
  for (const k of Object.keys(note.data)) if (note.data[k] === undefined) delete note.data[k];
  writeDay(date, note);
  return getDay(date);
}

// ---------- sleep measured by the phone ----------
// One night: `night` is the date the evening was on. Bedtime goes on that day's note; wake time (and the
// hours slept, if none were typed) on the next day's. The bedtime habit is marked done when in bed by the
// target, half within 30 minutes after it; never "not done", and a mark already there is kept.
export function recordSleep(night, { bed, wake, hours }, sleep) {
  if (!hhmm(bed) || !hhmm(wake)) throw new Error("sleep: bed and wake must be HH:MM");
  const evening = readDay(night);
  evening.data.bedtime = bed;
  const states = habitStates(evening);
  if (sleep?.habit && !states[sleep.habit]) {
    const late = minutesAfter(bed, sleep.by);
    const mark = late <= 0 ? "done" : late <= 30 ? "half" : null;
    if (mark) {
      states[sleep.habit] = mark;
      const order = readHabits().map((h) => h.id);
      const ids = [...order.filter((id) => id in states), ...Object.keys(states).filter((id) => !order.includes(id))];
      evening.content = setSection(evening.content, "Habits", ids.map((id) => `- [${STATE_TO_MARK[states[id]]}] ${id}`).join("\n"));
    }
  }
  evening.data.type = "daily";
  evening.data.date = night;
  writeDay(night, evening);
  const nextDate = new Date(`${night}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + 1);
  const morning = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
  const day = readDay(morning);
  day.data.woke = wake;
  const h = num(hours);
  if (num(day.data.sleep_hours) === null && h !== null && h > 0 && h <= 24) day.data.sleep_hours = Math.round(h * 10) / 10;
  day.data.type = "daily";
  day.data.date = morning;
  writeDay(morning, day);
  return { night, morning };
}

// The few facts reward time and the Core habits card need from a day, without the rest of getDay.
export function dayFacts(date) {
  if (!existsSync(dayFile(date))) return null;
  const note = readDay(date);
  return { date, bedtime: hhmm(note.data.bedtime), pages: num(note.data.pages_read) ?? 0, played: num(note.data.played_min) ?? 0, states: habitStates(note) };
}

// Minutes from `target` to `time` around midnight: "23:10" vs "23:00" -> 10, "00:30" -> 90, "22:40" -> -20.
export function minutesAfter(time, target) {
  const m = (t) => {
    const [h, mm] = t.split(":").map(Number);
    return (h < 12 ? h + 24 : h) * 60 + mm; // after midnight counts as the same night
  };
  return m(time) - m(target);
}

// ---------- tasks ----------
const isBucket = (where) => where === SOMEDAY || where.startsWith("week:") || where.startsWith("month:");

export function addTask(where, task, { done = false, doneOn = null } = {}) {
  const t = cleanTask(task);
  if (!t.text) throw new Error("task: needs text");
  const note = readDay(where);
  const tasks = tasksOf(note);
  tasks.push({
    done,
    doneOn,
    text: t.text,
    time: isDate(where) ? (t.time ?? null) : null,
    after: isDate(where) ? (t.after ?? null) : null,
    priority: t.priority ?? null,
    repeat: where === SOMEDAY ? null : (t.repeat ?? null),
    deadline: isDate(where) && t.deadline === true,
    start: t.start ?? null,
    nag: t.nag === true,
    note: t.note ?? "",
    subtasks: t.subtasks ?? [],
  });
  setTasks(note, tasks);
  writeDay(where, note);
}

// Where the next one of a repeating task goes: the next date, or the week/month that date falls in.
function nextPlace(where, t, doneOn) {
  if (isDate(where)) return nextRepeat(where, t.repeat, doneOn);
  const start = where.startsWith("week:") ? weekMonday(where.slice(5)) : `${where.slice(6)}-01`;
  const next = nextRepeat(start, t.repeat, doneOn);
  if (!next) return null;
  return where.startsWith("week:") ? `week:${weekId(next)}` : `month:${next.slice(0, 7)}`;
}

// Edits the task at `index` of a place: { done, text, time, after, priority, repeat, deadline, start, nag,
// note, subtasks, remove, moveTo (another place) }.
export function editTask(where, index, changes) {
  const note = readDay(where);
  const tasks = tasksOf(note);
  const t = tasks[index];
  if (!t) throw new Error("task: not found");
  if (changes.remove) {
    tasks.splice(index, 1);
    setTasks(note, tasks);
    return writeDay(where, note);
  }
  Object.assign(t, cleanTask(changes));
  if (!isDate(where)) Object.assign(t, { time: null, after: null, deadline: false });
  let moveTo = changes.moveTo && isPlace(changes.moveTo) && changes.moveTo !== where ? changes.moveTo : null;
  if ("done" in changes) {
    const wasDone = t.done;
    t.done = Boolean(changes.done);
    t.doneOn = t.done ? today() : null;
    if (t.done && !wasDone) {
      // Finishing a repeating task puts the next one in its place (once).
      const next = t.repeat ? nextPlace(where, t, t.doneOn) : null;
      if (next && !tasksOf(readDay(next)).some((x) => x.text === t.text && !x.done)) addTask(next, { ...t, done: false, subtasks: t.subtasks.map((s) => ({ ...s, done: false })) });
      // A week/month/someday task that is done goes into today's note, so the day keeps it (and its XP).
      if (isBucket(where)) moveTo = today();
    }
  }
  if (moveTo) {
    tasks.splice(index, 1);
    setTasks(note, tasks);
    writeDay(where, note);
    return addTask(moveTo, { ...t, repeat: t.repeat }, { done: t.done, doneOn: t.doneOn });
  }
  setTasks(note, tasks);
  writeDay(where, note);
}

// ---------- notes: the Inbox, newest first (Today's Notes tab; private, shown live only) ----------
export function readNotes(limit = 400) {
  const file = join(vaultRoot(), "Inbox", "Inbox.md");
  if (!existsSync(file)) return [];
  const notes = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^- (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))? (.+)$/.exec(line.trim());
    if (m) notes.push({ date: m[1], time: m[2] ?? null, text: m[3] });
  }
  return notes.reverse().slice(0, limit);
}

// ---------- quick capture ----------
export function capture(kind, text, title) {
  const body = String(text ?? "").trim();
  if (!body) throw new Error("capture: needs text");
  if (kind === "brainstorm") {
    const name = String(title || body.split(/\r?\n/)[0]).trim().slice(0, 80);
    let slug = slugify(name) || `idea-${Date.now()}`;
    const dir = join(vaultRoot(), "Brainstorm");
    mkdirSync(dir, { recursive: true });
    for (let n = 2; existsSync(join(dir, `${slug}.md`)); n++) slug = `${slugify(name)}-${n}`;
    const note = `---\ntype: brainstorm\nstatus: seed\narea: null\ncreated: ${today()}\n---\n# ${name}\n\n## Thought dump\n${body}\n\n## What challenges this?\n\n\n## Next step, or park it\n\n`;
    writeFileSync(join(dir, `${slug}.md`), note, { flag: "wx" });
    return `Brainstorm/${slug}.md`;
  }
  const file = join(vaultRoot(), "Inbox", "Inbox.md");
  mkdirSync(dirname(file), { recursive: true });
  const now = new Date();
  const stamp = `${today()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const old = existsSync(file) ? readFileSync(file, "utf8") : "---\ntype: inbox\n---\n# Inbox\n\n";
  backup(file);
  writeFileSync(file, `${old.trimEnd()}\n- ${stamp} ${body.replace(/\r?\n/g, " ")}\n`);
  return "Inbox/Inbox.md";
}
