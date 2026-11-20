// Honest progress (replaces levels and XP, which only ever went up). Everything here can go down as well
// as up, and you are only compared with yourself:
//  - this month's consistency against your usual (the average of the 3 months before, with data)
//  - the last 7 days against the 7 before
//  - the last 12 months as bars, the best one marked
//  - the days you showed up this year (any habit done, half done or showed up)
// Consistency = the average day score (done 1, half 0.5, showed up 0.25, not done 0; see score.ts).
import { dayScore } from "./insights";
import type { DailyRecord } from "./types";

export interface MonthBar {
  month: string; // YYYY-MM
  label: string; // "Nov"
  score: number | null; // null with fewer than MIN_DAYS logged days
  days: number;
}
export interface Progress {
  month: MonthBar & { usual: number | null; usualFrom: string[]; diff: number | null };
  week: { now: number | null; before: number | null };
  months: MonthBar[];
  best: string | null;
  year: { year: number; showedUp: number; daysSoFar: number };
}

const MIN_DAYS = 5; // a month needs this many logged days before its number means anything
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function computeProgress(records: DailyRecord[], today = new Date()): Progress {
  const scored = records.map((r) => ({ date: r.date, score: dayScore(r), r })).filter((x) => x.score !== null) as { date: string; score: number; r: DailyRecord }[];
  const monthBar = (month: string): MonthBar => {
    const days = scored.filter((x) => x.date.startsWith(month));
    const label = new Date(`${month}-15T12:00:00`).toLocaleString("en-GB", { month: "short" });
    return { month, label, days: days.length, score: days.length >= MIN_DAYS ? avg(days.map((x) => x.score)) : null };
  };
  const monthAgo = (n: number) => ymd(new Date(today.getFullYear(), today.getMonth() - n, 15)).slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => monthBar(monthAgo(11 - i)));

  const current = monthBar(monthAgo(0));
  // This month's number counts from its first logged day (a 3-day-old month is still shown, marked as early).
  const nowDays = scored.filter((x) => x.date.startsWith(current.month));
  const nowScore = avg(nowDays.map((x) => x.score));
  const before = [1, 2, 3].map((n) => monthBar(monthAgo(n))).filter((m) => m.score !== null);
  const usual = avg(before.map((m) => m.score!));

  const dayAgo = (n: number) => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
  const between = (from: number, to: number) => avg(scored.filter((x) => x.date > dayAgo(from) && x.date <= dayAgo(to)).map((x) => x.score));

  const year = today.getFullYear();
  const showedUp = records.filter((r) => r.date.startsWith(String(year)) && Object.values(r.habits).some((s) => s === "done" || s === "half" || s === "partial")).length;
  const daysSoFar = Math.round((today.getTime() - new Date(year, 0, 1).getTime()) / 864e5) + 1;
  const withScore = months.filter((m) => m.score !== null);
  const best = withScore.length >= 2 ? withScore.reduce((a, b) => (b.score! > a.score! ? b : a)).month : null;

  return {
    month: { ...current, score: nowScore, usual, usualFrom: before.map((m) => m.label).reverse(), diff: nowScore !== null && usual !== null ? nowScore - usual : null },
    week: { now: between(7, 0), before: between(14, 7) },
    months,
    best,
    year: { year, showedUp, daysSoFar },
  };
}
