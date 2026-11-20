// How a task looks in a note (Obsidian Tasks style, so Obsidian shows and edits it too):
//
//   - [ ] Submit report 🔁 every week on Monday, Friday when done ⏰ 10:00 ⏫ ⚑ 🛫 2026-11-09 🔔
//       A note line (indented text under the task)
//       - [ ] A step (indented checkbox = subtask)
//       - [x] Another step
//
//   ⏰ 10:00     time            ⚓ wake+15  at an anchor's time (+/- minutes; Settings, "Your day")
//   ⏫ 🔼 🔽     priority        ⚑          deadline (reminder the evening before)
//   🛫 date      start date: hidden from the lists until then
//   🔔           nag: the reminder repeats every 15 minutes (4 times) until it is done
//   🔁 ...       repeat: every [N] day(s)|week(s)|month(s)|year(s), every weekday,
//                every week on Monday, Friday · "when done" counts from the day it was done ·
//                "until 2026-12-31" stops it
//   ✅ date      when it was done
const PRIORITY = { "⏫": "high", "🔼": "medium", "🔽": "low" };
export const PRIORITY_MARK = { high: "⏫", medium: "🔼", low: "🔽" };
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MARKS = "⏰⏫🔼🔽⚑✅🛫🔔⚓📅";
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------- repeats ----------
// "every 2 weeks on Monday, Friday when done until 2026-12-31" -> { n, unit, days, whenDone, until }
export function parseRepeat(text) {
  const s = String(text ?? "").trim().toLowerCase();
  const m = /^every\s+(?:(\d+)\s+)?(day|days|weekday|week|weeks|month|months|year|years)(?:\s+on\s+([a-z,\s]+?))?(\s+when done)?(?:\s+until\s+(\d{4}-\d{2}-\d{2}))?$/.exec(s);
  if (!m) return null;
  const n = Math.max(1, Math.min(99, Number(m[1] ?? 1)));
  const unit = m[2] === "weekday" ? "weekday" : m[2].replace(/s$/, "");
  const days = unit === "week" && m[3] ? [...new Set(m[3].split(/[,\s]+/).map((d) => DAYS.findIndex((x) => x.startsWith(d.slice(0, 3)))).filter((i) => i >= 0))].sort() : [];
  return { n, unit, days, whenDone: Boolean(m[4]), until: m[5] ?? null };
}

// The same rule written the way the notes keep it (or null when it is not a valid rule).
export function repeatText(text) {
  const r = parseRepeat(text);
  if (!r) return null;
  const base = r.unit === "weekday" ? "every weekday" : r.n === 1 ? `every ${r.unit}` : `every ${r.n} ${r.unit}s`;
  const on = r.days.length ? ` on ${r.days.map((i) => cap(DAYS[i])).join(", ")}` : "";
  return `${base}${on}${r.whenDone ? " when done" : ""}${r.until ? ` until ${r.until}` : ""}`;
}

// The next date after `date` (or after `doneOn` for "when done" rules); null when the rule has ended.
export function nextRepeat(date, repeat, doneOn = null) {
  const r = parseRepeat(repeat);
  if (!r) return null;
  const d = new Date(`${r.whenDone && isDate(doneOn) ? doneOn : date}T12:00:00`);
  if (r.unit === "day") d.setDate(d.getDate() + r.n);
  else if (r.unit === "weekday") do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
  else if (r.unit === "week" && r.days.length) {
    const startWeek = mondayOf(d);
    do d.setDate(d.getDate() + 1); while (!r.days.includes(d.getDay()));
    // "every 2 weeks on …": after the last chosen day of a week, skip the weeks in between.
    if (r.n > 1 && mondayOf(d).getTime() !== startWeek.getTime()) d.setDate(d.getDate() + 7 * (r.n - 1));
  } else if (r.unit === "week") d.setDate(d.getDate() + 7 * r.n);
  else {
    const day = d.getDate();
    d.setDate(1);
    if (r.unit === "month") d.setMonth(d.getMonth() + r.n);
    else d.setFullYear(d.getFullYear() + r.n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  const next = ymd(d);
  return r.until && next > r.until ? null : next;
}
function mondayOf(d) {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  m.setHours(12, 0, 0, 0);
  return m;
}

// ISO week id ("2026-W45") of a date.
export function weekId(date) {
  const d = new Date(`${date}T12:00:00`);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4, 12);
  const firstThursday = new Date(jan4);
  firstThursday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + 3);
  return `${thursday.getFullYear()}-W${pad(1 + Math.round((thursday - firstThursday) / (7 * 864e5)))}`;
}
export function weekMonday(id) {
  const [y, w] = id.split("-W").map(Number);
  const jan4 = new Date(y, 0, 4, 12);
  jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7);
  return ymd(jan4);
}

// ---------- one task <-> its lines ----------
function parseLine(body) {
  let text = body;
  const take = (re) => {
    const m = re.exec(text);
    if (m) text = text.replace(m[0], " ");
    return m;
  };
  const repeat = repeatText(take(new RegExp(`🔁\\s*(every[^${MARKS}]*)`, "u"))?.[1]?.trim());
  const time = take(/⏰\s*(\d{2}:\d{2})/)?.[1] ?? null;
  const after = take(/⚓\s*([a-z0-9-]+(?:[+-]\d{1,3})?)/u)?.[1] ?? null;
  const doneOn = take(/✅\s*(\d{4}-\d{2}-\d{2})/u)?.[1] ?? null;
  const start = take(/🛫\s*(\d{4}-\d{2}-\d{2})/u)?.[1] ?? null;
  const deadline = Boolean(take(/⚑/u));
  const nag = Boolean(take(/🔔/u));
  const priority = Object.entries(PRIORITY).find(([mark]) => text.includes(mark))?.[1] ?? null;
  text = text.replace(/[⏫🔼🔽]/gu, "").replace(/\s+/g, " ").trim();
  return { text, time, after, priority, doneOn, repeat, deadline, start, nag };
}

// The "## Tasks" section -> tasks with their notes and steps.
export function parseTasks(section) {
  const tasks = [];
  for (const line of section.split(/\r?\n/)) {
    const top = /^[-*+]\s*\[( |x|X)\]\s+(.*)$/.exec(line);
    if (top) {
      tasks.push({ done: top[1] !== " ", ...parseLine(top[2]), note: "", subtasks: [] });
      continue;
    }
    const last = tasks.at(-1);
    if (!last || !/^(\s{2,}|\t)/.test(line)) continue;
    const sub = /^\s+[-*+]\s*\[( |x|X)\]\s+(.*)$/.exec(line);
    if (sub) last.subtasks.push({ done: sub[1] !== " ", text: sub[2].replace(/✅\s*\d{4}-\d{2}-\d{2}/u, "").trim() });
    else if (line.trim()) last.note = last.note ? `${last.note}\n${line.trim()}` : line.trim();
  }
  return tasks;
}

export function taskLines(t, doneDate) {
  const marks = [
    t.repeat && `🔁 ${t.repeat}`,
    t.time && `⏰ ${t.time}`,
    t.after && `⚓ ${t.after}`,
    t.priority && PRIORITY_MARK[t.priority],
    t.deadline && "⚑",
    t.start && `🛫 ${t.start}`,
    t.nag && "🔔",
    t.done && `✅ ${t.doneOn ?? doneDate}`,
  ].filter(Boolean);
  const lines = [`- [${t.done ? "x" : " "}] ${t.text}${marks.length ? ` ${marks.join(" ")}` : ""}`];
  for (const l of String(t.note ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) lines.push(`    ${l}`);
  for (const s of t.subtasks ?? []) if (String(s.text ?? "").trim()) lines.push(`    - [${s.done ? "x" : " "}] ${String(s.text).trim()}`);
  return lines.join("\n");
}

// Cleans what a device sends for a task (add or edit); only the keys given are returned.
export function cleanTask(input) {
  const out = {};
  if ("text" in input && String(input.text ?? "").trim()) out.text = String(input.text).replace(/\s+/g, " ").trim().slice(0, 300);
  if ("time" in input) out.time = /^\d{2}:\d{2}$/.test(input.time ?? "") ? input.time : null;
  if ("after" in input) out.after = typeof input.after === "string" && /^[a-z0-9-]{1,60}([+-]\d{1,3})?$/.test(input.after) ? input.after : null;
  if ("priority" in input) out.priority = PRIORITY_MARK[input.priority] ? input.priority : null;
  if ("repeat" in input) out.repeat = repeatText(input.repeat);
  if ("deadline" in input) out.deadline = input.deadline === true;
  if ("nag" in input) out.nag = input.nag === true;
  if ("start" in input) out.start = isDate(input.start) ? input.start : null;
  if ("note" in input) out.note = String(input.note ?? "").slice(0, 2000);
  if ("subtasks" in input && Array.isArray(input.subtasks))
    out.subtasks = input.subtasks.slice(0, 50).map((s) => ({ done: s?.done === true, text: String(s?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200) })).filter((s) => s.text);
  return out;
}
