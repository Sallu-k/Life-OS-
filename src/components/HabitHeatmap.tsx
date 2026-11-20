import { dayLabel } from "@/lib/format";
import type { HabitRow } from "@/lib/vault/habitWindow";
import type { HabitState } from "@/lib/vault/types";

export const TEXT: Record<HabitState, string> = { done: "Done", half: "Half done", partial: "Showed up", missed: "Not done", na: "Not applicable", unrecorded: "No entry" };

// One row of squares per habit for a period. Filled = done, half filled = half, a dot = showed up;
// not done and no entry are both empty (solid / dashed border); not applicable is a faint slash. No streaks.
export function HabitHeatmap({ rows }: { rows: HabitRow[] }) {
  if (rows.length === 0) return null;
  const days = rows[0]?.days.map((d) => d.date) ?? [];
  const last = days[days.length - 1];
  const now = new Date();
  // Today's square gets an outline, but only if today is in the period shown (not the period's last day).
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="card flex flex-col gap-7 p-5 sm:p-7">
      {rows.map(({ habit, days }) => (
        <div key={habit.id} className="flex flex-col gap-2.5">
          <h3 className="flex items-baseline gap-2 text-sm text-ink">
            {habit.label}
            {!habit.active && <span className="text-xs text-ink-dim">(retired)</span>}
          </h3>
          <ol className="habit-grid" style={{ "--days": days.length } as React.CSSProperties} aria-label={`${habit.label}, ${days.length} days`}>
            {days.map((d) => {
              const label = `${dayLabel(d.date, true)}: ${TEXT[d.state]}`;
              return (
                <li
                  key={d.date}
                  title={label}
                  aria-label={label}
                  className={`habit-cell habit-${d.state} ${d.date === today ? "habit-today" : ""}`}
                />
              );
            })}
          </ol>
        </div>
      ))}

      {days.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-dim/10 pt-4 text-xs text-ink-dim">
          <span>
            {dayLabel(days[0], true)} → {dayLabel(last, true)}
          </span>
          <span className="flex flex-wrap items-center gap-4" aria-hidden="true">
            <Legend className="habit-done" label="Done" />
            <Legend className="habit-half" label="Half done" />
            <Legend className="habit-partial" label="Showed up" />
            <Legend className="habit-missed" label="Not done" />
            <Legend className="habit-na" label="Not applicable" />
            <Legend className="habit-unrecorded" label="No entry" />
          </span>
        </div>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`habit-cell w-3 ${className}`} />
      {label}
    </span>
  );
}
