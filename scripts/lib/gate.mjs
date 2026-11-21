// The Gate log: every phone unlock and PC sign-in/unlock asks "why?", and the answer is one line in
// Logs/Gate/YYYY-MM.md. Only the choice and numbers are kept, never the text of a note or task.
//   - 2026-11-20 14:03 phone fun videos 20m via=app
// choice: unlock (urgent) · fun · read (took the reading suggestion) · note · task ·
//         more (extended a fun session) · done (stopped when the time was up) · skip (left the Gate with
//         Home without choosing) · back (turned back at the breathing pause) · off (the Gate was switched off)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { backup, getDay } from "./days.mjs";
import { session } from "./knowledge.mjs";
import { listItems } from "./notes.mjs";
import { getRewards } from "./rewards.mjs";
import { readSettings } from "./settings.mjs";
import { vaultRoot } from "./vault-write.mjs";

export const CHOICES = ["unlock", "fun", "read", "note", "task", "more", "done", "back", "skip", "off"];
export const LINE = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) (phone|pc) (unlock|fun|read|note|task|more|done|back|skip|off)(?: ([a-z]{1,20}))?(?: (\d{1,3})m)?(?: via=(unlock|app|start))?$/;
const dir = () => join(vaultRoot(), "Logs", "Gate");
const pad = (n) => String(n).padStart(2, "0");
const stampOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// One event from a device -> one log line, or null when it is not valid (bad data is dropped, not guessed).
export function lineOf(e, now = new Date()) {
  if (!e || typeof e !== "object") return null;
  const at = e.at === undefined ? stampOf(now) : String(e.at);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(at)) return null;
  if (!["phone", "pc"].includes(e.device) || !CHOICES.includes(e.choice)) return null;
  const kind = e.choice === "fun" && /^[a-z]{1,20}$/.test(e.kind ?? "") ? ` ${e.kind}` : "";
  const m = Number(e.minutes);
  const minutes = ["fun", "more"].includes(e.choice) && Number.isInteger(m) && m > 0 && m <= 240 ? ` ${m}m` : "";
  const via = ["unlock", "app", "start"].includes(e.via) ? ` via=${e.via}` : "";
  const line = `- ${at} ${e.device} ${e.choice}${kind}${minutes}${via}`;
  return LINE.test(line) ? line : null;
}

// Saves a batch of events (the phone sends what it queued while away). Returns how many were kept.
export function logGate(events) {
  const list = (Array.isArray(events) ? events : [events]).slice(0, 500);
  const byMonth = new Map();
  for (const e of list) {
    const line = lineOf(e);
    if (!line) continue;
    const month = line.slice(2, 9);
    byMonth.set(month, [...(byMonth.get(month) ?? []), line]);
  }
  let saved = 0;
  for (const [month, lines] of byMonth) {
    const file = join(dir(), `${month}.md`);
    mkdirSync(dirname(file), { recursive: true });
    const old = existsSync(file) ? readFileSync(file, "utf8") : `---\ntype: gate-log\nmonth: ${month}\n---\n# Gate ${month}\n\n`;
    const have = new Set(old.split(/\r?\n/));
    // A resent queue must not count twice. shortcut: two identical choices in the same minute count once; fine while the 2-minute grace stands.
    const fresh = lines.filter((l) => !have.has(l));
    if (!fresh.length) continue;
    backup(file);
    writeFileSync(file, `${old.trimEnd()}\n${fresh.join("\n")}\n`);
    saved += fresh.length;
  }
  return saved;
}

// Parsed lines for some months (YYYY-MM), oldest first.
export function readGate(months) {
  const out = [];
  for (const month of months) {
    const file = join(dir(), `${month}.md`);
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = LINE.exec(raw.trim());
      if (m) out.push({ date: m[1], time: m[2], device: m[3], choice: m[4], kind: m[5] ?? null, minutes: m[6] ? Number(m[6]) : 0, via: m[7] ?? null });
    }
  }
  return out;
}

// Totals for a list of events: how often each choice was made, fun minutes, and extensions.
export function countGate(events) {
  const c = { gates: 0, unlock: 0, fun: 0, read: 0, note: 0, task: 0, skip: 0, more: 0, back: 0, funMinutes: 0 };
  for (const e of events) {
    if (["unlock", "fun", "read", "note", "task", "skip"].includes(e.choice)) (c.gates++, c[e.choice]++);
    if (e.choice === "more") c.more++;
    if (e.choice === "back") c.back++; // turned back at the breathing pause
    if (e.choice === "fun" || e.choice === "more") c.funMinutes += e.minutes;
  }
  return c;
}

const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function daysBack(today, n) {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - n);
  return ymd(d);
}

// Everything a Gate screen needs, so it can show at once from a cached copy: settings, the book you are
// reading, the game-time bank, and counts for today, this week and last week (Monday weeks).
export function gateInfo(today) {
  const settings = readSettings();
  const monday = daysBack(today, (new Date(`${today}T12:00:00`).getDay() + 6) % 7);
  const lastMonday = daysBack(monday, 7);
  const months = [...new Set([lastMonday.slice(0, 7), today.slice(0, 7)])];
  const events = readGate(months).filter((e) => e.date >= lastMonday);
  let book = null;
  try {
    const b = listItems("books").find((x) => x.status === "reading");
    if (b) book = { slug: b.slug, title: String(b.title), progress: Number(b.progress) || 0, pages: Number(b.pages) || null };
  } catch {
    book = null;
  }
  const tasks = topTasksOf(today);
  return {
    ...settings.gate,
    date: today, // the phone trusts `today` counts only on this date
    accent: settings.theme.accent,
    book,
    bank: getRewards(today).bank,
    // The most important open tasks (their text is shown on the Gates only, never stored in the log).
    topTasks: tasks,
    nextTask: asLine(tasks[0]), // older phone apps read this line
    // What the Gate shows before leisure (cached on the phone, so it works offline): a few cards and the
    // next passage of the current long read.
    knowledge: knowledgeOf(today),
    today: countGate(events.filter((e) => e.date === today)),
    week: countGate(events.filter((e) => e.date >= monday)),
    lastWeek: countGate(events.filter((e) => e.date < monday)),
  };
}

// Totals between two dates (inclusive), e.g. a review week.
export function gateBetween(from, to) {
  const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
  return countGate(readGate(months).filter((e) => e.date >= from && e.date <= to));
}

// The most important open tasks, best first: today's plus the unfinished ones carried from the last two
// weeks. Higher priority first, then overdue or with a deadline, then the earliest time. The Gate shows
// the first as "your one thing" and can tick it (POST /api/task/done); the next one then takes its place.
const RANK = { high: 0, medium: 1, low: 3 };
export function topTasksOf(today, n = 3) {
  try {
    const day = getDay(today);
    const open = [...day.tasks, ...day.carried]
      .filter((t) => !t.done && !(t.start && t.start > today))
      .map((t) => ({ text: t.text, date: t.date, time: t.time ?? null, priority: t.priority ?? null, deadline: Boolean(t.deadline), overdue: t.date < today }));
    open.sort((a, b) => (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2) || Number(b.overdue || b.deadline) - Number(a.overdue || a.deadline) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
    return open.slice(0, n);
  } catch {
    return [];
  }
}
const asLine = (t) => (t ? `${t.time ? `${t.time} ` : ""}${t.text}`.slice(0, 80) : null);

function knowledgeOf(today) {
  try {
    return session(today, 4);
  } catch {
    return null;
  }
}
