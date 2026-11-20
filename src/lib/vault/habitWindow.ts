import type { DailyRecord, HabitDefinition, HabitState } from "./types";

export interface HabitRow {
  habit: HabitDefinition;
  days: { date: string; state: HabitState }[];
}

// Local calendar date as YYYY-MM-DD (the build date when run at build time).
export function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The n calendar days ending on `today`, oldest first.
export function lastNDays(n: number, today: Date): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)));
  }
  return days;
}

// One row per habit. Inactive habits are shown only if they have done/missed days in the window.
export function habitRows(habits: HabitDefinition[], records: Pick<DailyRecord, "date" | "habits">[], days: string[]): HabitRow[] {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const rows: HabitRow[] = [];
  for (const habit of habits) {
    const row = days.map((date) => ({ date, state: byDate.get(date)?.habits[habit.id] ?? ("unrecorded" as HabitState) }));
    const hasData = row.some((d) => d.state !== "unrecorded" && d.state !== "na");
    if (habit.active || hasData) rows.push({ habit, days: row });
  }
  return rows;
}
