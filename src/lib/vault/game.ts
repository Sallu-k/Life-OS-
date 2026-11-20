// The game layer over your habits: XP, levels, habit strength, forgiving streaks and reviews.
// Pure functions over the loaded vault data, run at build time. The ideas behind it:
// - Habit strength (as in Loop Habit Tracker): an exponentially weighted average of recent marks, so one
//   missed day barely moves it, but weeks of practice build it up. Half-life of about two weeks.
// - XP rewards effort, not perfection: harder habits give more, half done and "showed up" still count.
//   XP is never taken away; a missed day only means less growth.
// - Forgiving streaks: one miss per 7 days is forgiven (a grace day), so one bad day does not erase a run.
// - Levels rise on a gentle curve (each level needs a bit more XP than the last), as in most RPGs.
import { parseFun } from "@/lib/fun";
import type { Achievement, Area, DailyRecord, HabitDefinition, HabitState, MonthNote } from "./types";

export const XP_BASE = { easy: 10, medium: 20, hard: 35 } as const;
export const MARK_WEIGHT: Partial<Record<HabitState, number>> = { done: 1, half: 0.5, partial: 0.25, missed: 0 };
const HALF_LIFE = 14; // tracked days for a habit's strength to half-forget the past
const ALPHA = 1 - Math.pow(0.5, 1 / HALF_LIFE);
const XP = { task: 5, taskHigh: 5, pagesPerXp: 2, pagesCap: 40, achievement: 150, questDone: 100, questProgress: 40, bookFinished: 60, gameFinished: 40 };


// Level from XP: level L needs 50·L² XP in total (L1 = 50, L10 = 5 000, L30 = 45 000).
export function levelOf(xp: number): { level: number; into: number; need: number } {
  const level = Math.floor(Math.sqrt(xp / 50));
  const start = 50 * level * level;
  const next = 50 * (level + 1) * (level + 1);
  return { level, into: xp - start, need: next - start };
}
// Every tenth level is a milestone (a bigger celebration).
export const milestoneOf = (level: number) => Math.floor(level / 10);

export interface HabitStat {
  id: string;
  label: string;
  area: string | null;
  active: boolean;
  strength: number; // 0..1
  streak: number; // current run of good days (grace days forgiven); 0 for core habits (they count weeks)
  best: number;
  core: boolean;
  weeksMet: number; // core habits: weeks in a row the weekly target was reached (this week counts once reached)
  xp: number;
  days: number; // tracked days
}
export interface AreaStat {
  id: string;
  label: string;
  xp: number;
  level: number;
  into: number;
  need: number;
  strength: number | null; // average strength of the area's active habits
}
export interface Period {
  label: string;
  from: string;
  to: string;
  xp: number;
  days: number;
  consistency: number | null; // average mark weight of tracked habit-days
  best: { label: string; value: number } | null;
  focus: { label: string; value: number } | null; // the habit that needs the most care
}
export interface Quest {
  month: string;
  text: string;
  status: string;
  xp: number;
}
export interface GameState {
  xp: number;
  todayXp: number; // part of xp earned on `today` (Today adds live changes on top)
  level: number;
  into: number;
  need: number;
  areas: AreaStat[];
  habits: HabitStat[];
  week: Period;
  lastWeek: Period;
  month: Period;
  lastMonth: Period;
  quests: Quest[];
  challenge: Challenge;
}

// The monthly challenge: beat your usual month. The target is the average XP of the last three months (at
// least 300); the XP you earn this month counts toward it. Missing it costs nothing.
export interface Challenge {
  month: string; // YYYY-MM
  hp: number;
  damage: number;
  defeated: boolean;
  daysLeft: number;
  record: { defeated: number; months: number }; // past months: challenges met / months with any XP
}

function monthChallenge(dailyXp: Map<string, number>, today: string): Challenge {
  const byMonth = new Map<string, number>();
  for (const [date, xp] of dailyXp) byMonth.set(date.slice(0, 7), (byMonth.get(date.slice(0, 7)) ?? 0) + xp);
  const month = today.slice(0, 7);
  const months = [...byMonth.keys()].filter((m) => m < month).sort();
  // A month's target from the three months before it.
  const hpFor = (m: string) => {
    const before = months.filter((x) => x < m).slice(-3);
    const usual = before.length ? before.reduce((s, x) => s + (byMonth.get(x) ?? 0), 0) / before.length : 0;
    return Math.max(300, Math.round(usual));
  };
  const hp = hpFor(month);
  const damage = byMonth.get(month) ?? 0;
  const [y, mo] = month.split("-").map(Number);
  const daysLeft = new Date(y, mo, 0).getDate() - Number(today.slice(8, 10));
  const past = months.filter((m) => months.indexOf(m) >= 3); // need three months before to set a fair target
  return {
    month,
    hp,
    damage,
    defeated: damage >= hp,
    daysLeft,
    record: { defeated: past.filter((m) => (byMonth.get(m) ?? 0) >= hpFor(m)).length, months: past.length },
  };
}

// Core habits (the few that matter most) count double.
const base = (h: HabitDefinition) => XP_BASE[h.difficulty ?? "medium"] * (h.core ? 2 : 1);

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// A habit's tracked days in date order: only days where it has a real mark (n/a and no entry are skipped,
// so imported months where a habit was not tracked never count against it).
function marksOf(h: HabitDefinition, records: DailyRecord[]): { date: string; w: number }[] {
  const out: { date: string; w: number }[] = [];
  for (const r of records) {
    const w = MARK_WEIGHT[r.habits[h.id] ?? "unrecorded"];
    if (w !== undefined) out.push({ date: r.date, w });
  }
  return out;
}

// Streaks over tracked days: a day counts if at least half done. One miss per 7 days is forgiven.
function streaks(marks: { date: string; w: number }[], today: string): { current: number; best: number } {
  let run = 0;
  let best = 0;
  let lastGrace = "1900-01-01";
  for (const m of marks) {
    if (m.w >= 0.5) run++;
    else if (run > 0 && addDays(lastGrace, 7) <= m.date) lastGrace = m.date; // forgiven
    else run = 0;
    best = Math.max(best, run);
  }
  const last = marks.at(-1)?.date;
  const current = last && addDays(last, 2) >= today ? run : 0; // a run is only "current" if it reaches the last 2 days
  return { current, best };
}

// Core habits: weeks (Monday to Sunday) in a row with at least `target` good days (done or half). The
// week in progress counts once its target is reached, and never breaks the run while still open.
function weeksInARow(marks: { date: string; w: number }[], target: number, today: string): number {
  const good = new Map<string, number>();
  for (const m of marks) if (m.w >= 0.5) good.set(mondayOf(m.date), (good.get(mondayOf(m.date)) ?? 0) + 1);
  let week = mondayOf(today);
  let run = (good.get(week) ?? 0) >= target ? 1 : 0;
  for (;;) {
    week = addDays(week, -7);
    if ((good.get(week) ?? 0) < target) return run;
    run++;
  }
}
function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

function period(label: string, from: string, to: string, habits: HabitDefinition[], records: DailyRecord[], dailyXp: Map<string, number>): Period {
  const days = records.filter((r) => r.date >= from && r.date <= to);
  let total = 0;
  let count = 0;
  const per: { label: string; value: number; n: number }[] = [];
  for (const h of habits) {
    const ws = days.map((r) => MARK_WEIGHT[r.habits[h.id] ?? "unrecorded"]).filter((w): w is number => w !== undefined);
    if (ws.length === 0) continue;
    const avg = ws.reduce((a, b) => a + b, 0) / ws.length;
    total += ws.reduce((a, b) => a + b, 0);
    count += ws.length;
    per.push({ label: h.label, value: avg, n: ws.length });
  }
  const ranked = per.filter((p) => p.n >= 3).sort((a, b) => b.value - a.value);
  return {
    label,
    from,
    to,
    xp: days.reduce((sum, r) => sum + (dailyXp.get(r.date) ?? 0), 0),
    days: days.length,
    consistency: count ? total / count : null,
    best: ranked[0] ? { label: ranked[0].label, value: ranked[0].value } : null,
    focus: ranked.length > 1 ? { label: ranked.at(-1)!.label, value: ranked.at(-1)!.value } : null,
  };
}

const QUEST_STATUS: Record<string, [number, string]> = { done: [XP.questDone, "Completed"], progress: [XP.questProgress, "In progress"], not: [0, "Not achieved"], none: [0, "Open"] };

// Finished books and games (finished = YYYY-MM). Undated ones still count, on the first tracked day.
export interface Finished {
  kind: "book" | "game";
  finished: string | null;
}

export function computeGame(
  habits: HabitDefinition[],
  records: DailyRecord[],
  areas: Area[],
  achievements: Achievement[],
  months: MonthNote[],
  today: string,
  finished: Finished[] = [],
): GameState {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const areaXp = new Map<string, number>();
  const dailyXp = new Map<string, number>();
  const addXp = (date: string, area: string | null, xp: number) => {
    dailyXp.set(date, (dailyXp.get(date) ?? 0) + xp);
    if (area) areaXp.set(area, (areaXp.get(area) ?? 0) + xp);
  };

  const habitStats: HabitStat[] = habits.map((h) => {
    const marks = marksOf(h, sorted);
    let strength = 0;
    let xp = 0;
    for (const m of marks) {
      strength = strength * (1 - ALPHA) + m.w * ALPHA;
      const gained = Math.round(base(h) * m.w);
      xp += gained;
      addXp(m.date, h.area, gained);
    }
    const { current, best } = streaks(marks, today);
    const weeksMet = h.core ? weeksInARow(marks, h.weekly ?? 5, today) : 0;
    return { id: h.id, label: h.label, area: h.area, active: h.active, strength, streak: h.core ? 0 : current, best, xp, days: marks.length, core: h.core, weeksMet };
  });

  // Effort outside habits: tasks, reading, fun, achievements, monthly quests.
  for (const r of sorted) {
    addXp(r.date, null, r.tasksDone * XP.task + r.tasksHigh * XP.taskHigh);
    if (r.pages) addXp(r.date, "knowledge", Math.min(XP.pagesCap, Math.floor(r.pages / XP.pagesPerXp)));
    if (r.fun.length) addXp(r.date, "fun", r.fun.reduce((sum, line) => sum + parseFun(line).kind.xp, 0)); // story games count most
  }
  for (const a of achievements) addXp(a.date, a.area, XP.achievement);
  const firstDay = sorted[0]?.date ?? today;
  for (const f of finished) {
    const date = f.finished ? `${f.finished.slice(0, 7)}-28` : firstDay;
    if (f.kind === "book") addXp(date, "knowledge", XP.bookFinished);
    else addXp(date, "fun", XP.gameFinished);
  }
  const quests: Quest[] = months.flatMap((m) =>
    m.goals.map((g) => {
      const [xp, status] = QUEST_STATUS[g.status] ?? [0, "Open"];
      if (xp) addXp(`${m.month}-28`, null, xp);
      return { month: m.month, text: g.text, status, xp };
    }),
  );

  const total = [...dailyXp.values()].reduce((a, b) => a + b, 0);
  const { level, into, need } = levelOf(total);
  const areaStats: AreaStat[] = areas
    .filter((a) => a.active)
    .map((a) => {
      const xp = areaXp.get(a.id) ?? 0;
      const own = habitStats.filter((h) => h.area === a.id && h.active && h.days > 0);
      return { id: a.id, label: a.label, xp, ...levelOf(xp), strength: own.length ? own.reduce((s, h) => s + h.strength, 0) / own.length : null };
    });

  // Weeks run Monday to Sunday; months are calendar months.
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = addDays(today, -dow);
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthEnd = addDays(monthStart, -1);
  const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;

  return {
    xp: total,
    todayXp: dailyXp.get(today) ?? 0,
    level,
    into,
    need,
    areas: areaStats,
    habits: habitStats.filter((h) => h.days > 0 || h.active).sort((a, b) => b.strength - a.strength),
    week: period("This week", weekStart, today, habits, sorted, dailyXp),
    lastWeek: period("Last week", addDays(weekStart, -7), addDays(weekStart, -1), habits, sorted, dailyXp),
    month: period("This month", monthStart, today, habits, sorted, dailyXp),
    lastMonth: period("Last month", prevMonthStart, prevMonthEnd, habits, sorted, dailyXp),
    quests: quests.filter((q) => q.month >= prevMonthStart.slice(0, 7)),
    challenge: monthChallenge(dailyXp, today),
  };
}

// XP for one day from its marks (used live on the Today screen).
export function dayXp(habits: { difficulty?: string | null; core?: boolean; state: HabitState | null }[]): number {
  return habits.reduce((sum, h) => {
    const base = (XP_BASE[(h.difficulty ?? "medium") as keyof typeof XP_BASE] ?? XP_BASE.medium) * (h.core ? 2 : 1);
    return sum + Math.round(base * (MARK_WEIGHT[h.state ?? "unrecorded"] ?? 0));
  }, 0);
}
