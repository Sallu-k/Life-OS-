import Link from "next/link";
import { dayLabel } from "@/lib/format";
import type { ReadingStats } from "@/lib/vault/reading";

// The Library's reading panel: this year's goal, pace (pages a day over the last 30 days) and, for each
// book being read, how far along it is and when it will be done at that pace.
export function ReadingPanel({ stats }: { stats: ReadingStats }) {
  const { goal, finishedThisYear, expectedByNow, pace, pagesThisMonth, now, year } = stats;
  if (!goal && now.length === 0 && pace === null) return null;
  const ahead = goal && expectedByNow !== null ? finishedThisYear - expectedByNow : null;

  return (
    <section className="reading-panel card" aria-labelledby="reading-heading">
      <div className="reading-summary">
        <h2 id="reading-heading" className="eyebrow">
          Reading {year}
        </h2>
        <p className="font-serif text-2xl text-ink">
          {finishedThisYear}
          {goal ? <span className="text-ink-dim"> of {goal} books</span> : <span className="text-ink-dim"> books finished</span>}
        </p>
        {goal && (
          <span className="progress-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (finishedThisYear / goal) * 100)}%` }} />
          </span>
        )}
        <p className="text-xs text-ink-dim">
          {ahead === null ? "Set a yearly goal in Settings." : ahead >= 0 ? `On track${ahead > 0 ? ` · ${ahead} ahead` : ""}` : `${-ahead} behind the goal's pace`}
          {pace !== null && ` · ${pace.toFixed(pace < 10 ? 1 : 0)} pages a day (30 days) · ${pagesThisMonth} this month`}
        </p>
      </div>
      {now.length > 0 && (
        <ul className="reading-now">
          {now.map((b) => (
            <li key={b.slug}>
              <Link href={`/books/${b.slug}/`} className="text-sm text-ink hover:text-brass">
                {b.title}
              </Link>
              {b.pages ? (
                <>
                  <span className="progress-bar" aria-label={`Page ${b.progress} of ${b.pages}`}>
                    <span style={{ width: `${Math.min(100, (b.progress / b.pages) * 100)}%` }} />
                  </span>
                  <span className="text-xs text-ink-dim">
                    page {b.progress} of {b.pages}
                    {b.finishBy ? ` · done about ${dayLabel(b.finishBy, true)}` : " · log pages on Today to see a finish date"}
                  </span>
                </>
              ) : (
                <span className="text-xs text-ink-dim">Add the page count (Edit) to track progress.</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
