import { scoreOf } from "@/lib/vault/score";
import type { DailyRecord, HabitDefinition, HabitState } from "@/lib/vault/types";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// One clean row per active habit (like Loop and Streaks): the last 14 days as dots, and how much of the
// last 7 and 30 days was done (done 1, half 0.5, showed up 0.25; not applicable and no entry left out).
export function HabitOverview({ habits, records, today = new Date() }: { habits: HabitDefinition[]; records: DailyRecord[]; today?: Date }) {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i));
      return ymd(d);
    });
  const last14 = days(14);
  const last30 = days(30);
  const stateOf = (id: string, date: string): HabitState | undefined => byDate.get(date)?.habits[id];
  const score = (id: string, window: string[]) => scoreOf(window.map((d) => stateOf(id, d)).filter((s): s is HabitState => Boolean(s))).value;

  return (
    <section className="card habit-overview" aria-label="Your habits at a glance">
      <div className="habit-overview-head" aria-hidden="true">
        <span />
        <span>last 14 days</span>
        <span>7 d</span>
        <span>30 d</span>
      </div>
      <ul>
        {habits
          .filter((h) => h.active)
          .map((h) => {
            const s30 = score(h.id, last30);
            return (
              <li key={h.id} className="habit-overview-row">
                <span className="truncate text-sm text-ink">{h.label}</span>
                <span className="habit-dots" aria-label={`${h.label}: last 14 days`}>
                  {last14.map((d) => (
                    <span key={d} className={`habit-dot habit-${stateOf(h.id, d) ?? "unrecorded"}`} title={`${d}: ${stateOf(h.id, d) ?? "no entry"}`} />
                  ))}
                </span>
                <span className="text-sm text-ink">{pct(score(h.id, days(7)))}</span>
                <span className="flex items-center gap-2 text-sm text-ink-dim">
                  {pct(s30)}
                  <span className="status-bar habit-overview-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round((s30 ?? 0) * 100)}%` }} />
                  </span>
                </span>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
