"use client";

import { useState } from "react";
import { late, MISSED_REASONS, whenLabel, type MissedReason } from "@/lib/dayRules";
import { feel } from "@/lib/feel/sounds";
import { habitTime, type DaySetup } from "@/lib/anchors";
import { MARKS, type DayHabit, type Mark } from "./types";

const DOTS = { easy: 1, medium: 2, hard: 3 } as const;

interface Props {
  date: string;
  place: DaySetup;
  habits: DayHabit[];
  readOnly: boolean; // finished/locked or future day
  missed: Record<string, string>;
  logged: Record<string, string>;
  onMark(id: string, mark: Mark | null, button: Element | null): void;
  onReason(id: string, reason: MissedReason | null): void;
}

// Today's habits: the ones due today first, then (folded) the ones not scheduled today.
// One tap sets a mark; tapping the same mark again clears it. A "not done" habit can get a reason.
export function HabitList({ date, place, habits, readOnly, missed, logged, onMark, onReason }: Props) {
  const [showRest, setShowRest] = useState(false);
  const due = habits.filter((h) => h.due && h.active);
  const rest = habits.filter((h) => !h.due || !h.active);
  const marked = due.filter((h) => h.state !== null).length;
  const row = (h: DayHabit) => <HabitRow key={h.id} date={date} time={habitTime(h, date, place)} habit={h} readOnly={readOnly} reason={missed[h.id]} loggedAt={logged[h.id]} onMark={onMark} onReason={onReason} />;
  // Habits that follow an anchor are grouped under it (in the order of the day); the rest come last.
  const routines = [...place.anchors].sort((a, b) => a.time.localeCompare(b.time)).filter((a) => due.some((h) => h.after === a.id));
  const anyTime = due.filter((h) => !routines.some((a) => a.id === h.after));

  return (
    <section aria-labelledby="habits-heading" className="card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="habits-heading" className="font-serif text-xl text-ink">
          Habits
        </h2>
        <span className="text-xs text-ink-dim">
          {marked} of {due.length} logged
        </span>
      </div>
      {routines.length === 0 ? (
        <ul className="flex flex-col divide-y divide-ink-dim/10">{due.map(row)}</ul>
      ) : (
        <>
          {routines.map((a) => (
            <div key={a.id} className="habit-group">
              <h3 className="habit-group-title">
                {a.label} <span>{a.time}</span>
              </h3>
              <ul className="flex flex-col divide-y divide-ink-dim/10">{due.filter((h) => h.after === a.id).map(row)}</ul>
            </div>
          ))}
          {anyTime.length > 0 && (
            <div className="habit-group">
              <h3 className="habit-group-title">Any time</h3>
              <ul className="flex flex-col divide-y divide-ink-dim/10">{anyTime.map(row)}</ul>
            </div>
          )}
        </>
      )}
      {rest.length > 0 && (
        <>
          <button type="button" className="mt-3 text-xs text-ink-dim underline-offset-4 hover:underline" onClick={() => setShowRest(!showRest)}>
            {showRest ? "Hide" : "Show"} {rest.length} not scheduled today
          </button>
          {showRest && <ul className="mt-2 flex flex-col divide-y divide-ink-dim/10 opacity-80">{rest.map(row)}</ul>}
        </>
      )}
    </section>
  );
}

function HabitRow({ date, time, habit, readOnly, reason, loggedAt, onMark, onReason }: { date: string; time: string | null; habit: DayHabit; readOnly: boolean; reason?: string; loggedAt?: string } & Pick<Props, "onMark" | "onReason">) {
  const meta = [time && `⏰ ${time}`, habit.target].filter(Boolean).join(" · ");
  return (
    <li className="habit-row">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm text-ink">
          {habit.label}
          {habit.difficulty && (
            <span className="text-[10px] tracking-widest text-brass" title={`Difficulty: ${habit.difficulty}`}>
              {"●".repeat(DOTS[habit.difficulty])}
            </span>
          )}
        </p>
        {meta && <p className="text-xs text-ink-dim">{meta}</p>}
        {habit.state && late(date, loggedAt) && <p className="text-xs text-ink-dim">filled in later · {whenLabel(loggedAt!)}</p>}
      </div>
      <div className="habit-marks" role="group" aria-label={`${habit.label}: mark`}>
        {MARKS.map((m) => (
          <button
            key={m.mark}
            type="button"
            title={m.label}
            aria-label={m.label}
            aria-pressed={habit.state === m.mark}
            disabled={readOnly}
            className={`mark-btn mark-${m.mark}`}
            onClick={(e) => onMark(habit.id, habit.state === m.mark ? null : m.mark, e.currentTarget)}
          >
            {m.icon}
          </button>
        ))}
      </div>
      {habit.state === "missed" && (
        <div className="missed-reasons" role="group" aria-label={`${habit.label}: why not done`}>
          <span className="text-xs text-ink-dim">Why?</span>
          {MISSED_REASONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="reason-chip"
              aria-pressed={reason === value}
              disabled={readOnly}
              onClick={() => (feel("select"), onReason(habit.id, reason === value ? null : value))}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
