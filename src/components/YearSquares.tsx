import { dayLabel } from "@/lib/format";

// The whole year at a glance: one square per day (weeks as columns, Monday on top), filled more the
// more of that day's habits were done. Empty = nothing logged. Never red: a bad day is just pale.
export function YearSquares({ year, squares }: { year: number; squares: { date: string; score: number | null; mood: number | null }[] }) {
  const first = new Date(`${year}-01-01T12:00:00`);
  const lead = (first.getDay() + 6) % 7; // empty cells before 1 January so weeks start on Monday
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const logged = squares.filter((s) => s.score !== null);
  const avg = logged.length ? logged.reduce((a, s) => a + (s.score ?? 0), 0) / logged.length : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="year-squares" role="img" aria-label={`${year}: ${logged.length} days logged${avg !== null ? `, ${Math.round(avg * 100)}% of habits done on average` : ""}`}>
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} className="year-square year-square-blank" />
        ))}
        {squares.map((s) => (
          <span
            key={s.date}
            className={`year-square ${s.date > today ? "year-square-blank" : s.score === null ? "year-square-empty" : ""}`}
            title={`${dayLabel(s.date, true)}: ${s.score === null ? "nothing logged" : `${Math.round(s.score * 100)}% of habits`}${s.mood ? ` · mood ${s.mood}/5` : ""}`}
            style={s.score !== null ? { background: `color-mix(in srgb, var(--brass) ${Math.round(15 + s.score * 85)}%, var(--surface))` } : undefined}
          />
        ))}
      </div>
      <p className="text-xs text-ink-dim">
        {logged.length} days logged in {year}
        {avg !== null && ` · ${Math.round(avg * 100)}% of habits done on an average day`} · paler = less done, empty = not logged
      </p>
    </div>
  );
}
