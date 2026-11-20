// Weekly review: the week's numbers (from the daily notes) and three short answers the owner writes:
// wins, lessons, next week's focus. Saved as Weekly/YYYY-Www.md (ISO weeks, Monday to Sunday).
// The answers are private like the journal: only read through the server, never built into the site.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { backup, getDay } from "./days.mjs";
import { getSection, setSection } from "./notes.mjs";
import { vaultRoot } from "./vault-write.mjs";

const SCORE = { done: 1, half: 0.5, partial: 0.25, missed: 0 };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ISO week id ("2026-W45") and its Monday..Sunday dates for any date.
export function weekOf(date) {
  const d = new Date(`${date}T12:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4, 12);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday - firstThursday) / (7 * 864e5));
  const days = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return ymd(x);
  });
  return { id: `${thursday.getFullYear()}-W${pad(week)}`, from: days[0], to: days[6], days };
}

// The Monday of an ISO week id.
export function weekFromId(id) {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) throw new Error("week: must look like 2026-W45");
  const jan4 = new Date(Number(m[1]), 0, 4, 12);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (Number(m[2]) - 1) * 7);
  return weekOf(ymd(monday));
}

const file = (id) => join(vaultRoot(), "Weekly", `${id}.md`);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

function weekStats(days) {
  const all = days.map((d) => getDay(d)).filter((d) => d.exists);
  const scores = [];
  const perHabit = new Map();
  for (const d of all) {
    const marks = d.habits.filter((h) => h.state && h.state !== "na").map((h) => [h, SCORE[h.state] ?? null]);
    const vals = marks.map(([, v]) => v).filter((v) => v !== null);
    if (vals.length) scores.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    for (const [h, v] of marks) if (v !== null) perHabit.set(h.label, [...(perHabit.get(h.label) ?? []), v]);
  }
  const ranked = [...perHabit].filter(([, v]) => v.length >= 3).map(([label, v]) => [label, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]);
  const num = (k) => all.map((d) => d[k]).filter((v) => v !== null && v !== undefined);
  return {
    daysLogged: all.length,
    habitsDone: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : null,
    productivity: avg(num("productivity")),
    screenTime: avg(num("screenTime")),
    sleep: avg(num("sleep")),
    mood: avg(num("mood")),
    pages: num("pages").reduce((a, b) => a + b, 0),
    tasksDone: all.reduce((s, d) => s + d.tasks.filter((t) => t.done).length, 0),
    fun: all.reduce((s, d) => s + d.fun.length, 0),
    strongest: ranked[0]?.[0] ?? null,
    needsCare: ranked.length > 1 ? ranked.at(-1)[0] : null,
  };
}

export function getReview(id) {
  const w = weekFromId(id);
  const exists = existsSync(file(id));
  const note = exists ? matter(readFileSync(file(id), "utf8")) : { data: {}, content: "" };
  return {
    ...w,
    done: exists && Boolean(note.data.saved), // a week note may hold only goals (Plan page)
    savedAt: note.data.saved ?? null,
    stats: weekStats(w.days),
    wins: getSection(note.content, "Wins").trim(),
    lessons: getSection(note.content, "Lessons").trim(),
    focus: getSection(note.content, "Next week").trim(),
  };
}

export function saveReview(id, { wins = "", lessons = "", focus = "" }) {
  const r = getReview(id);
  const p = file(id);
  const old = existsSync(p) ? matter(readFileSync(p, "utf8")) : { data: {}, content: `# Week ${id}\n\n## Wins\n\n## Lessons\n\n## Next week\n` };
  let content = old.content;
  content = setSection(content, "Wins", String(wins).trim());
  content = setSection(content, "Lessons", String(lessons).trim());
  content = setSection(content, "Next week", String(focus).trim());
  const now = new Date();
  const data = { ...old.data, type: "weekly", week: id, from: r.from, to: r.to, saved: `${ymd(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`, stats: r.stats };
  backup(p);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, matter.stringify(`\n${content.replace(/^\s+/, "")}`, data));
  return getReview(id);
}
