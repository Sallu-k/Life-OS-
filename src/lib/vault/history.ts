// Small, pure helpers for looking back over the daily notes: which months have data, the days of a month,
// and per-month numbers. No Node imports, so browser components can use them too.
import { scoreOf } from "./score";
import type { HabitState } from "./types";

// Only what the habit history needs from a daily record (no keep lines), so it can be sent to the browser.
export interface DayData {
  date: string; // YYYY-MM-DD
  habits: Record<string, HabitState>;
  productivity: number | null;
  screenTime: number | null;
  pages: number | null;
}

export const monthOf = (date: string) => date.slice(0, 7);

// Every month that has at least one daily note, oldest first.
export function monthsWithData(days: DayData[]): string[] {
  return [...new Set(days.map((d) => monthOf(d.date)))].sort();
}

// The latest month with data, or null when there is none.
export function latestMonth(days: DayData[]): string | null {
  const months = monthsWithData(days);
  return months.length > 0 ? months[months.length - 1] : null;
}

// Every month from `from` to `to` inclusive, "2024-11".."2025-02" -> 2024-11, 2024-12, 2025-01, 2025-02.
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  while (`${y}-${String(m).padStart(2, "0")}` <= to) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// Every calendar date of a month, "2024-08" -> ["2024-08-01", ... "2024-08-31"].
export function datesOfMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}

// "2024-08" -> "August 2024" (or "Aug 2024" when short)
export function monthName(ym: string, short = false): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: short ? "short" : "long", year: "numeric", timeZone: "UTC" });
}

function average(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  return real.length === 0 ? null : real.reduce((a, b) => a + b, 0) / real.length;
}

export interface Summary {
  days: number; // daily notes in the period
  productivity: number | null; // average percent
  screenTime: number | null; // average hours
  pages: number | null; // total pages
}

// The three numbers for a set of days. Missing values are left out, never counted as zero.
export function summarise(days: DayData[]): Summary {
  const pages = days.map((d) => d.pages).filter((v): v is number => v !== null);
  return {
    days: days.length,
    productivity: average(days.map((d) => d.productivity)),
    screenTime: average(days.map((d) => d.screenTime)),
    pages: pages.length === 0 ? null : pages.reduce((a, b) => a + b, 0),
  };
}

// How consistent a habit was over some days (see score.ts for how marks count).
export function habitScore(days: DayData[], habitId: string) {
  return scoreOf(days.map((d) => d.habits[habitId] ?? "unrecorded"));
}

// The habits that appear in a set of days, in the order of the habit list.
export function habitsUsed(days: DayData[], order: string[]): string[] {
  const used = new Set(days.flatMap((d) => Object.keys(d.habits)));
  return order.filter((id) => used.has(id));
}
