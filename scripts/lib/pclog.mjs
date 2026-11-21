// PC time per app, from StayFree (the owner's PC screen-time app), kept in the vault as a small log:
//   Logs/PC/YYYY-MM.md   one line per day: minutes per app (biggest first) and minutes after the night lock
//   - 2026-11-20 late=54 | Brave Browser=128 | VALORANT=64 | Visual Studio Code=52
// Written by the LifeOS server once an hour (only when something changed, with a backup first). Read by
// Insights and the weekly review. Only app names and minutes: never window titles or sites.
// StayFree's own database is never opened in place: a copy is read (it may be writing at the time).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { backup } from "./days.mjs";
import { readSettings } from "./settings.mjs";
import { vaultRoot } from "./vault-write.mjs";

const dir = () => join(vaultRoot(), "Logs", "PC");
const file = (month) => join(dir(), `${month}.md`);
const LINE = /^- (\d{4}-\d{2}-\d{2}) late=(\d+)((?: \| [^|=]+=\d+)*)$/;
const MAX_SESSION = 6 * 3600_000; // a longer session is StayFree missing a sleep or lock: not counted
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// StayFree's database: the Microsoft Store app (a package folder) or the plain Windows app.
export function stayFreeDb() {
  const local = process.env.LOCALAPPDATA ?? "";
  const packages = join(local, "Packages");
  const store = existsSync(packages) ? readdirSync(packages).find((d) => /StayFree/i.test(d)) : null;
  const candidates = [store && join(packages, store, "LocalCache", "Roaming", "StayFree", "usage.db"), join(process.env.APPDATA ?? "", "StayFree", "usage.db")];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

// Minutes of "now" (a Date) between two clock times of a day ("22:30" to "05:00" the next morning).
const minuteOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
function lateWindow(date, from, until) {
  const start = new Date(`${date}T${from}:00`);
  const end = new Date(`${date}T${until}:00`);
  if (minuteOf(until) <= minuteOf(from)) end.setDate(end.getDate() + 1);
  return [start.getTime(), end.getTime()];
}

// Sessions -> { "2026-11-20": { apps: { "Brave Browser": 128, ... }, late: 54 } } (minutes, whole numbers).
export function summarize(sessions, night) {
  const days = {};
  const add = (date, key, ms) => {
    days[date] ??= { apps: {}, late: 0 };
    if (key === null) days[date].late += ms;
    else days[date].apps[key] = (days[date].apps[key] ?? 0) + ms;
  };
  for (const { appId, startedAt, endedAt } of sessions) {
    const ms = endedAt - startedAt;
    if (!appId || ms <= 0 || ms > MAX_SESSION) continue;
    const start = new Date(startedAt);
    add(ymd(start), String(appId), ms);
    // After the night lock: the window that starts this evening, and the one from the evening before.
    for (const back of [0, 1]) {
      const d = new Date(start);
      d.setDate(d.getDate() - back);
      const [a, b] = lateWindow(ymd(d), night.from, night.until);
      const overlap = Math.min(endedAt, b) - Math.max(startedAt, a);
      if (overlap > 0) add(ymd(d), null, overlap);
    }
  }
  const out = {};
  for (const [date, d] of Object.entries(days)) {
    const apps = Object.fromEntries(Object.entries(d.apps).map(([k, v]) => [k, Math.round(v / 60_000)]).filter(([, v]) => v > 0));
    out[date] = { apps, late: Math.round(d.late / 60_000) };
  }
  return out;
}

const clean = (name) => name.replace(/[|=\r\n]/g, " ").replace(/�/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
const lineOf = (date, d) =>
  `- ${date} late=${d.late}${Object.entries(d.apps)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([app, m]) => ` | ${clean(app)}=${m}`)
    .join("")}`;

// Reads StayFree (a copy) for the days since `fromDate` and writes the month files that changed.
// Returns the months written, or null when StayFree is not on this PC.
export async function writePcLog(fromDate) {
  const db = stayFreeDb();
  if (!db) return null;
  const copy = join(tmpdir(), "lifeos-stayfree");
  mkdirSync(copy, { recursive: true });
  for (const ext of ["", "-wal", "-shm"]) if (existsSync(db + ext)) copyFileSync(db + ext, join(copy, `usage.db${ext}`));
  const { DatabaseSync } = await import("node:sqlite"); // built into Node: no package needed
  const sqlite = new DatabaseSync(join(copy, "usage.db"), { readOnly: true });
  const since = new Date(`${fromDate}T00:00:00`).getTime() - 86_400_000; // the evening before counts for late
  let sessions;
  try {
    sessions = sqlite.prepare("select appId, startedAt, endedAt from sessions where endedAt >= ?").all(since);
  } finally {
    sqlite.close();
  }
  const g = readSettings();
  const night = { from: g.gate.night?.from ?? g.sleep.by, until: g.gate.night?.until ?? "05:00" };
  const days = summarize(sessions, night);
  const today = ymd(new Date());
  const months = {};
  for (const [date, d] of Object.entries(days)) if (date >= fromDate && date <= today) (months[date.slice(0, 7)] ??= []).push(lineOf(date, d));
  const written = [];
  for (const [month, lines] of Object.entries(months)) {
    const p = file(month);
    const old = existsSync(p) ? readFileSync(p, "utf8") : "";
    // Keep days already in the file that this run did not look at (older than fromDate).
    const kept = old.split(/\r?\n/).filter((l) => LINE.test(l) && l.slice(2, 12) < fromDate);
    const body = [...kept, ...lines].sort();
    const text = `---\ntype: pc-log\nmonth: ${month}\n---\n# PC ${month}\n\nMinutes per app each day, from StayFree (written by the LifeOS server). late = minutes after the night lock (${night.from} to ${night.until}).\n\n${body.join("\n")}\n`;
    if (text === old) continue;
    backup(p);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
    written.push(month);
  }
  return written;
}

// The log for a span of days: { date: { apps, late } }.
export function readPcLog(from, to) {
  const out = {};
  if (!existsSync(dir())) return out;
  for (const f of readdirSync(dir()).filter((x) => /^\d{4}-\d{2}\.md$/.test(x))) {
    if (f.slice(0, 7) < from.slice(0, 7) || f.slice(0, 7) > to.slice(0, 7)) continue;
    for (const raw of readFileSync(join(dir(), f), "utf8").split(/\r?\n/)) {
      const m = LINE.exec(raw.trim());
      if (!m || m[1] < from || m[1] > to) continue;
      const apps = {};
      for (const part of m[3].split(" | ").slice(1)) {
        const i = part.lastIndexOf("=");
        apps[part.slice(0, i).trim()] = Number(part.slice(i + 1));
      }
      out[m[1]] = { apps, late: Number(m[2]) };
    }
  }
  return out;
}

// A week (or any span) for the weekly review: hours, the top apps and minutes after the night lock a night.
export function pcBetween(from, to) {
  const days = Object.values(readPcLog(from, to));
  if (!days.length) return null;
  const apps = {};
  for (const d of days) for (const [a, m] of Object.entries(d.apps)) apps[a] = (apps[a] ?? 0) + m;
  const total = Object.values(apps).reduce((s, m) => s + m, 0);
  return {
    days: days.length,
    hours: Math.round((total / 60) * 10) / 10,
    top: Object.entries(apps)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([app, m]) => ({ app, hours: Math.round((m / 60) * 10) / 10 })),
    lateMin: Math.round(days.reduce((s, d) => s + d.late, 0) / days.length),
  };
}

// When the log was last changed (for the server's hourly run: the first run fills the history).
export const pcLogStarted = () => existsSync(dir()) && readdirSync(dir()).some((f) => /^\d{4}-\d{2}\.md$/.test(f) && statSync(join(dir(), f)).size > 0);
