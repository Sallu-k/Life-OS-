import type { GameState, Period } from "@/lib/vault/game";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function Bar({ into, need }: { into: number; need: number }) {
  return (
    <span className="status-bar" style={{ flex: "none" }} aria-hidden="true">
      <span style={{ width: `${Math.round((into / Math.max(1, need)) * 100)}%` }} />
    </span>
  );
}

// Areas and habits, styled like a status window: area strength, weekly and monthly reviews, habit strength
// with forgiving streaks, and this month's quests. No levels or XP: progress is the ProgressCard above.
export function StatusWindow({ game }: { game: GameState }) {
  return (
    <section aria-label="Areas and habits" className="card system-window flex flex-col gap-8 p-5 sm:p-8">
      <div>
        <h3 className="status-h">Areas</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {game.areas.map((a) => (
            <li key={a.id} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between text-sm">
                <span className="text-ink">{a.label}</span>
                <span className="text-xs text-ink-dim">strength {pct(a.strength)}</span>
              </span>
              <Bar into={Math.round((a.strength ?? 0) * 100)} need={100} />
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Review now={game.week} before={game.lastWeek} />
        <Review now={game.month} before={game.lastMonth} />
      </div>

      <div>
        <h3 className="status-h">Habit strength</h3>
        <p className="mb-3 text-xs text-ink-dim">Recent days count most (about a two-week memory), so strength grows with practice and fades slowly when you skip, like a real habit. Streaks forgive one miss a week.</p>
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {game.habits
            .filter((h) => h.active)
            .map((h) => (
              <li key={h.id} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-ink">{h.label}</span>
                <span className="status-bar min-w-8 flex-1" aria-hidden="true">
                  <span style={{ width: `${Math.round(h.strength * 100)}%` }} />
                </span>
                <span className="shrink-0 whitespace-nowrap text-right text-xs text-ink-dim">
                  {pct(h.strength)}
                  {h.streak > 1 && <span title={`Streak: ${h.streak} days (best ${h.best})`}> · 🔥{h.streak}</span>}
                  {h.core && h.weeksMet > 0 && <span title={`Weekly target reached ${h.weeksMet} week${h.weeksMet > 1 ? "s" : ""} in a row`}> · ★{h.weeksMet}w</span>}
                </span>
              </li>
            ))}
        </ul>
      </div>



      {game.quests.length > 0 && (
        <div>
          <h3 className="status-h">Quests</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {game.quests.map((q, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4">
                <span className="text-ink">{q.text}</span>
                <span className="shrink-0 text-xs text-ink-dim">
                  {q.status}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-dim">Quests are the goals in your month notes (Journal/YYYY-MM.md).</p>
        </div>
      )}
    </section>
  );
}

function Review({ now, before }: { now: Period; before: Period }) {
  const change = now.consistency !== null && before.consistency !== null ? Math.round((now.consistency - before.consistency) * 100) : null;
  return (
    <div className="status-review">
      <h3 className="status-h">{now.label}</h3>
      {now.days === 0 ? (
        <p className="text-sm text-ink-dim">Nothing logged yet.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-dim">Days logged</dt>
          <dd className="text-ink">{now.days}</dd>
          <dt className="text-ink-dim">Consistency</dt>
          <dd className="text-ink">
            {pct(now.consistency)}
            {change !== null && change !== 0 && <span className="text-xs text-ink-dim"> ({change > 0 ? "+" : ""}{change} vs {before.label.toLowerCase()})</span>}
          </dd>
          {now.best && (
            <>
              <dt className="text-ink-dim">Strongest</dt>
              <dd className="text-ink">{now.best.label}</dd>
            </>
          )}
          {now.focus && (
            <>
              <dt className="text-ink-dim">Needs care</dt>
              <dd className="text-ink">{now.focus.label}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
