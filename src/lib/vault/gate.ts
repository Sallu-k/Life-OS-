// The Gate log (Logs/Gate/YYYY-MM.md, written by the LifeOS server, scripts/lib/gate.mjs): one line per
// choice made on the phone or PC after an unlock. Only choices and numbers are in it, never text.
//   - 2026-11-20 14:03 phone fun videos 20m via=app
// Read when the site is built, for the Insights page.
import fs from "node:fs";
import path from "node:path";
import type { Finding } from "./insights";
import { vaultRoot } from "./paths";
import type { DailyRecord } from "./types";

export interface GateEvent {
  date: string;
  device: "phone" | "pc";
  choice: "unlock" | "fun" | "read" | "note" | "task" | "more" | "done" | "back" | "skip" | "off";
  minutes: number;
}

// Same line format as scripts/lib/gate.mjs (LINE).
const LINE = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) (phone|pc) (unlock|fun|read|note|task|more|done|back|skip|off)(?: ([a-z]{1,20}))?(?: (\d{1,3})m)?(?: via=(unlock|app|start))?$/;
const GATES = new Set(["unlock", "fun", "read", "note", "task", "skip"]);

export function loadGate(): GateEvent[] {
  const dir = path.join(vaultRoot(), "Logs", "Gate");
  if (!fs.existsSync(dir)) return [];
  const out: GateEvent[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.md$/.test(f)).sort())
    for (const raw of fs.readFileSync(path.join(dir, file), "utf8").split(/\r?\n/)) {
      const m = LINE.exec(raw.trim());
      if (m) out.push({ date: m[1], device: m[3] as GateEvent["device"], choice: m[4] as GateEvent["choice"], minutes: m[6] ? Number(m[6]) : 0 });
    }
  return out;
}

const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
function ago(today: string, n: number) {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// What the Gate shows about how the screen is used. Each finding needs a few days or sessions first.
export function gateFindings(events: GateEvent[], records: DailyRecord[], today: string): Finding[] {
  const out: Finding[] = [];
  const count = (list: GateEvent[], choice: string) => list.filter((e) => e.choice === choice).length;

  // 1. How often and why, the last 14 days.
  const recent = events.filter((e) => e.date > ago(today, 14) && GATES.has(e.choice));
  const days = new Set(recent.map((e) => e.date)).size;
  if (days >= 3) {
    const n = recent.length;
    const fun = count(recent, "fun");
    out.push({
      title: `${Math.round(n / days)} unlocks a day lately, ${pct(fun, n)} of them for fun.`,
      detail: `Urgent ${pct(count(recent, "unlock"), n)} · fun ${pct(fun, n)} · book instead ${count(recent, "read")} · notes ${count(recent, "note")} · tasks ${count(recent, "task")}${count(recent, "skip") ? ` · skipped ${count(recent, "skip")}` : ""}.`,
      days,
      tone: "neutral",
    });
  }

  // 2. Fun sessions: stopped when the time was up, or asked for more? And how often the book won.
  const month = events.filter((e) => e.date > ago(today, 28));
  const sessions = count(month, "fun");
  const done = count(month, "done");
  const more = count(month, "more");
  if (done + more >= 5)
    out.push({
      title: done >= more ? `When fun time runs out, you usually stop.` : `When fun time runs out, you usually ask for more.`,
      detail: `Last 4 weeks: stopped ${done} times, asked for 10 more ${more} times, across ${sessions} fun sessions.`,
      days: new Set(month.filter((e) => e.choice === "done" || e.choice === "more").map((e) => e.date)).size,
      tone: done >= more ? "good" : "care",
    });
  // Turned back: chose the book, or "Never mind" at the breathing pause, instead of fun.
  const read = count(month, "read");
  const back = count(month, "back");
  const reached = read + back + sessions;
  if (reached >= 5)
    out.push({
      title: read + back > 0 ? `You turned back ${Math.round(((read + back) / reached) * 100)}% of the times you reached for fun.` : `You have not turned back yet when you reached for fun.`,
      detail: `Last 4 weeks: the book won ${read} times, "Never mind" at the pause ${back} times, fun went ahead ${sessions} times.`,
      days: new Set(month.filter((e) => ["read", "back", "fun"].includes(e.choice)).map((e) => e.date)).size,
      tone: read + back > 0 ? "good" : "neutral",
    });

  // 3. Bored time: the longest phone-free stretch of the day, lately against the two weeks before.
  const bored = (from: number, to: number) => records.filter((r) => r.boredMin !== null && r.date > ago(today, to) && r.date <= ago(today, from)).map((r) => r.boredMin!);
  const now = bored(0, 14);
  const before = bored(14, 28);
  if (now.length >= 5)
    out.push({
      title: `Your longest phone-free stretch is ${Math.round(avg(now))} minutes a day on average.`,
      detail: before.length >= 5 ? `The two weeks before: ${Math.round(avg(before))} minutes. Measured by the phone between 08:00 and 22:00.` : `Measured by the phone between 08:00 and 22:00.`,
      days: now.length,
      tone: before.length >= 5 && avg(now) < avg(before) ? "care" : "good",
    });

  // 4. Fun minutes from the Gate against pages read that day.
  const funByDay = new Map<string, number>();
  for (const e of events) if (e.choice === "fun" || e.choice === "more") funByDay.set(e.date, (funByDay.get(e.date) ?? 0) + e.minutes);
  const pairs = records.filter((r) => r.pages !== null && events.some((e) => e.date === r.date)).map((r) => [funByDay.get(r.date) ?? 0, r.pages!] as const);
  const median = [...pairs.map(([f]) => f)].sort((a, b) => a - b)[Math.floor(pairs.length / 2)];
  const high = pairs.filter(([f]) => f > median).map(([, p]) => p);
  const low = pairs.filter(([f]) => f <= median).map(([, p]) => p);
  if (high.length >= 8 && low.length >= 8 && Math.abs(avg(high) - avg(low)) >= 3)
    out.push({
      title: avg(high) < avg(low) ? `On days with more fun screen time, you read less.` : `More fun screen time has not cost you reading.`,
      detail: `Over ${median} min of Gate fun: ${Math.round(avg(high))} pages; ${median} min or less: ${Math.round(avg(low))} pages.`,
      days: pairs.length,
      tone: avg(high) < avg(low) ? "care" : "neutral",
    });
  return out;
}
