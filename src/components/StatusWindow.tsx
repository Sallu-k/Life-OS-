import type { GameState, Period } from "@/lib/vault/game";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function Bar({ into, need }: { into: number; need: number }) {
  return (
    <span className="status-bar" aria-hidden="true">
      <span style={{ width: `${Math.round((into / Math.max(1, need)) * 100)}%` }} />
    </span>
  );
}

// The game view of your habits, styled like a status window: level, XP, area stats,
// habit strength with forgiving streaks, weekly and monthly reviews, and this month's quests.
export function StatusWindow({ game }: { game: GameState }) {
  return (
    <section aria-labelledby="status-heading" className="card system-window flex flex-col gap-8 p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-6">
        <div className="status-rank" aria-label={`Level ${game.level}`}>
          {game.level}
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Status</p>
          <h2 id="status-heading" className="font-serif text-3xl text-ink">
            Level {game.level}
          </h2>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-dim">
            <Bar into={game.into} need={game.need} />
            <span>
              {game.into.toLocaleString("en-GB")} / {game.need.toLocaleString("en-GB")} XP · {game.xp.toLocaleString("en-GB")} total
            </span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="status-h">Stats</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {game.areas.map((a) => (
            <li key={a.id} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between text-sm">
                <span className="text-ink">{a.label}</span>
                <span className="text-xs text-ink-dim">
                  Lv {a.level} · strength {pct(a.strength)}
                </span>
              </span>
              <Bar into={a.into} need={a.need} />
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
        <p className="mb-3 text-xs text-ink-dim">Recent days count most (about a two-week memory). Streaks forgive one miss a week, and XP is never taken away.</p>
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {game.habits
            .filter((h) => h.active)
            .map((h) => (
              <li key={h.id} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 truncate text-ink">{h.label}</span>
                <span className="status-bar flex-1" aria-hidden="true">
                  <span style={{ width: `${Math.round(h.strength * 100)}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-ink-dim">
                  {pct(h.strength)}
                  {h.streak > 1 && <span title={`Streak: ${h.streak} days (best ${h.best})`}> · 🔥{h.streak}</span>}
                  {h.core && h.weeksMet > 0 && <span title={`Weekly target reached ${h.weeksMet} week${h.weeksMet > 1 ? "s" : ""} in a row`}> · ★{h.weeksMet}w</span>}
                </span>
              </li>
            ))}
        </ul>
      </div>

      <ChallengeCard challenge={game.challenge} />

      {game.quests.length > 0 && (
        <div>
          <h3 className="status-h">Quests</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {game.quests.map((q, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4">
                <span className="text-ink">{q.text}</span>
                <span className="shrink-0 text-xs text-ink-dim">
                  {q.status}
                  {q.xp > 0 && ` · +${q.xp} XP`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-dim">Quests are the goals in your month notes (Journal/YYYY-MM.md). A completed goal gives 100 XP.</p>
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
        <p className="text-sm text-ink-dim">Nothing logged yet. Every habit you tick on Today adds XP here.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-dim">XP gained</dt>
          <dd className="text-ink">+{now.xp.toLocaleString("en-GB")}</dd>
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

// This month's challenge: beat your usual month; the bar fills with the XP you earn.
function ChallengeCard({ challenge }: { challenge: GameState["challenge"] }) {
  const share = Math.min(100, Math.round((challenge.damage / challenge.hp) * 100));
  return (
    <div className="challenge-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="status-h">Monthly challenge</h3>
        <span className="text-xs text-ink-dim">
          {challenge.record.months > 0 ? `${challenge.record.defeated} of ${challenge.record.months} past months beaten` : "first month"}
        </span>
      </div>
      <p className="font-serif text-xl text-ink">Beat your usual month</p>
      <span className="challenge-hp" aria-label={`${share}% of the target`}>
        <span style={{ width: `${share}%` }} />
      </span>
      <p className="text-xs text-ink-dim">
        {challenge.defeated
          ? `Done: ${challenge.damage} XP against a target of ${challenge.hp}.`
          : `${challenge.damage} of ${challenge.hp} XP · ${challenge.daysLeft} day${challenge.daysLeft === 1 ? "" : "s"} left · every habit and task counts. Missing it costs nothing.`}
      </p>
    </div>
  );
}
