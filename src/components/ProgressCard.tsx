import type { Progress } from "@/lib/vault/progress";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const points = (d: number) => `${Math.abs(Math.round(d * 100))} point${Math.abs(Math.round(d * 100)) === 1 ? "" : "s"}`;

// Honest progress (src/lib/vault/progress.ts): this month against your own usual, this week against last,
// the last 12 months, and the days you showed up. It can go down; that is information, not a verdict.
export function ProgressCard({ p }: { p: Progress }) {
  const { month, week } = p;
  const weekDiff = week.now !== null && week.before !== null ? week.now - week.before : null;
  return (
    <section aria-labelledby="progress-heading" className="card system-window flex flex-col gap-7 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">This month</p>
          <h2 id="progress-heading" className="font-serif text-5xl text-ink">
            {pct(month.score)}
          </h2>
          <p className="mt-1 text-sm text-ink-dim">
            {month.diff === null
              ? month.usual === null
                ? "Your usual appears once a month has 5 logged days."
                : "Log a few days and this month is compared with your usual."
              : Math.round(month.diff * 100) === 0
                ? `Right at your usual (${pct(month.usual)}).`
                : `${points(month.diff)} ${month.diff > 0 ? "above" : "below"} your usual (${pct(month.usual)}, ${month.usualFrom.length > 1 ? `${month.usualFrom[0]}–${month.usualFrom.at(-1)}` : month.usualFrom[0]}).`}
            {month.days > 0 && month.days < 5 && " Early days: only a few logged so far."}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="eyebrow">Last 7 days</p>
          <p className="font-serif text-3xl text-ink">{pct(week.now)}</p>
          {weekDiff !== null && Math.round(weekDiff * 100) !== 0 && (
            <p className="text-xs text-ink-dim">
              {weekDiff > 0 ? "↑" : "↓"} {points(weekDiff)} on the week before
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="status-h">The last 12 months</h3>
        <ol className="progress-bars" aria-label="Consistency per month">
          {p.months.map((m) => (
            <li key={m.month} className={`${m.month === month.month ? "is-now" : ""} ${m.month === p.best ? "is-best" : ""}`} title={m.score === null ? `${m.label}: fewer than 5 days logged` : `${m.label}: ${pct(m.score)} over ${m.days} days`}>
              <span className="progress-bar" style={{ height: `${Math.max(4, Math.round((m.score ?? 0) * 100))}%` }} aria-hidden="true" />
              <span className="progress-month">
                {m.month === p.best ? "★" : ""}
                {m.label.slice(0, 1)}
              </span>
              <span className="sr-only">
                {m.label}: {m.score === null ? "not enough days" : pct(m.score)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-sm text-ink-dim">
        You showed up on <span className="text-ink">{p.year.showedUp}</span> of the {p.year.daysSoFar} days of {p.year.year} so far. Every one of them counted. Compared only with you: these numbers can go down as well as up, so when they rise, it is real.
      </p>
    </section>
  );
}
