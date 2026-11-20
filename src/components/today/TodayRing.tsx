import type { DayHabit } from "./types";

const WEIGHT: Record<string, number> = { done: 1, half: 0.5, partial: 0.25, missed: 0 };

// How much of today's due habits is done (done 1, half 0.5, showed up 0.25; not yet marked counts 0;
// "not applicable" is left out). Honest: it starts at 0 each morning and only today's actions fill it.
export function todayScore(habits: DayHabit[]): number | null {
  const due = habits.filter((h) => h.due && h.active && h.state !== "na");
  if (!due.length) return null;
  return due.reduce((s, h) => s + (h.state ? (WEIGHT[h.state] ?? 0) : 0), 0) / due.length;
}

export function TodayRing({ habits }: { habits: DayHabit[] }) {
  const score = todayScore(habits);
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const c = 2 * Math.PI * 9;
  return (
    <span className="today-ring" title="Today's habits done" aria-label={`Today: ${pct}% of habits done`}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" className="today-ring-track" />
        <circle cx="12" cy="12" r="9" className="today-ring-fill" strokeDasharray={`${c * score} ${c}`} transform="rotate(-90 12 12)" />
      </svg>
      {pct}% today
    </span>
  );
}
