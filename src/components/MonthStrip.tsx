import { toYmd } from "@/lib/vault/habitWindow";
import { datesOfMonth, monthName } from "@/lib/vault/history";
import { scoreOf } from "@/lib/vault/score";
import type { DailyRecord, HabitDefinition } from "@/lib/vault/types";

// A small month card: one square per day, fuller when more of that day's habits were done
// (done 1, half 0.5, showed up 0.25), for the current month so far.
type StripProps = { habits: HabitDefinition[]; records: DailyRecord[]; today: Date };

// Always the current month: new tracking starts each month. Older months live on the Habits page.
function stripMonth(_records: DailyRecord[], today: Date): { ym: string; dates: string[] } {
  const ym = toYmd(today).slice(0, 7);
  return { ym, dates: datesOfMonth(ym).slice(0, today.getDate()) };
}

// The row of squares for the Home page's Habits tile (the tile is the link).
export function MonthCells({ habits, records, today }: StripProps) {
  if (habits.length === 0) return null;
  const byDate = new Map(records.map((r) => [r.date, r]));
  const { ym, dates } = stripMonth(records, today);
  const name = monthName(ym).split(" ")[0];

  return (
    <span className="habit-strip flex flex-wrap gap-1">
      {dates.map((date) => {
        const record = byDate.get(date);
        const { value } = scoreOf(Object.values(record?.habits ?? {}));
        const share = value === null ? 0 : Math.round(value * 75);
        const day = Number(date.slice(8));
        const label = `${day} ${name}: ${value === null ? "no entry" : `${Math.round(value * 100)}% of habits`}`;
        return (
          <span
            key={date}
            title={label}
            className={`habit-cell ${record ? "" : "habit-unrecorded"}`}
            style={share > 0 ? { background: `color-mix(in srgb, var(--brass) ${share}%, var(--surface))`, borderColor: "transparent" } : undefined}
          />
        );
      })}
    </span>
  );
}
