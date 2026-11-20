"use client";

import { whenLabel } from "@/lib/dayRules";

// The day's state above Today's cards: a future day (tasks only), a finished/locked day (with Unlock),
// an unlocked day (changes allowed until you leave it), or an open day (with Finish day).
export function DayState({
  date,
  future,
  locked,
  unlocked,
  finished,
  lockAt,
  isToday,
  onFinish,
  onUnlock,
  onRelock,
}: {
  date: string;
  future: boolean;
  locked: boolean;
  unlocked: boolean;
  finished: string | null;
  lockAt: string;
  isToday: boolean;
  onFinish(): void;
  onUnlock(): void;
  onRelock(): void;
}) {
  if (future)
    return (
      <div className="day-state" role="status">
        <span aria-hidden="true">🗓</span>
        <span className="flex-1">This day has not come yet. You can plan tasks for it; habits and notes open on the day.</span>
      </div>
    );
  if (locked && !unlocked)
    return (
      <div className="day-state day-state-locked" role="status">
        <span aria-hidden="true">🔒</span>
        <span className="flex-1">{finished ? `Finished on ${whenLabel(finished)}.` : `Closed on ${whenLabel(lockAt)}.`} This day is kept as it was.</span>
        <button
          type="button"
          className="chip"
          onClick={() => confirm(`Unlock ${date} to change it? It locks again when you leave this day.`) && onUnlock()}
        >
          Unlock
        </button>
      </div>
    );
  if (unlocked)
    return (
      <div className="day-state day-state-unlocked" role="status">
        <span aria-hidden="true">🔓</span>
        <span className="flex-1">Unlocked for changes. It locks again when you leave this day.</span>
        <button type="button" className="chip" onClick={onRelock}>
          Lock again
        </button>
      </div>
    );
  return (
    <div className="day-state" role="status">
      <span aria-hidden="true">✍</span>
      <span className="flex-1">
        {isToday ? "Open until you finish it" : "Still open"} · closes by itself on {whenLabel(lockAt)}.
      </span>
      <button type="button" className="chip edit-primary" onClick={() => confirm("Finish this day? It will be kept as it is now (you can still unlock it later).") && onFinish()}>
        Finish day
      </button>
    </div>
  );
}
