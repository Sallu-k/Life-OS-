// One habit over one year: a column per week, a row per weekday (Mon at the top), like a contribution graph.
// Same marks as the month view. Days outside the year are left out; days with no note are dashed.
import { dayLabel } from "@/lib/format";
import type { DayData } from "@/lib/vault/history";
import type { HabitState } from "@/lib/vault/types";
import { TEXT } from "./HabitHeatmap";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function YearHeatmap({ year, habit, label, days }: { year: number; habit: string; label: string; days: DayData[] }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = new Date(Date.UTC(year, 0, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const count = Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 864e5);
  const weeks = Math.ceil((count + offset) / 7);

  const cells: { date: string; state: HabitState; col: number; row: number }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(year, 0, 1 + i));
    const date = d.toISOString().slice(0, 10);
    const record = byDate.get(date);
    const state: HabitState = record ? (record.habits[habit] ?? "unrecorded") : "unrecorded";
    cells.push({ date, state, col: Math.floor((i + offset) / 7), row: (i + offset) % 7 });
  }
  const monthCols = MONTHS.map((m, k) => ({ m, col: Math.floor((Math.round((Date.UTC(year, k, 1) - first.getTime()) / 864e5) + offset) / 7) }));

  return (
    <div className="year-wrap" role="img" aria-label={`${label} in ${year}`}>
      <div className="year-months" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }} aria-hidden="true">
        {monthCols.map(({ m, col }) => (
          <span key={m} style={{ gridColumnStart: col + 1 }}>
            {m}
          </span>
        ))}
      </div>
      <div className="year-grid" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {cells.map((c) => (
          <span
            key={c.date}
            title={`${dayLabel(c.date, true)}: ${TEXT[c.state]}`}
            className={`habit-cell habit-${c.state}`}
            style={{ gridColumnStart: c.col + 1, gridRowStart: c.row + 1 }}
          />
        ))}
      </div>
    </div>
  );
}
