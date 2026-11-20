"use client";

import { useState, type MouseEvent } from "react";
import { late, MISSED_REASONS, whenLabel, type MissedReason } from "@/lib/dayRules";
import { feel } from "@/lib/feel/sounds";
import { habitTime, type DaySetup } from "@/lib/anchors";
import { DEFAULT_MARKS } from "./habitKinds";
import { localToday, MARKS, type DayHabit, type Mark } from "./types";

const DOTS = { easy: 1, medium: 2, hard: 3 } as const;

interface Props {
  date: string;
  place: DaySetup;
  habits: DayHabit[];
  readOnly: boolean; // finished/locked or future day
  missed: Record<string, string>;
  logged: Record<string, string>;
  onMark(id: string, mark: Mark | null, button: Element | null): void;
  onPart(id: string, part: string, mark: Mark | null, button: Element | null): void;
  onAmount(id: string, amount: number | null): void;
  onReason(id: string, reason: MissedReason | null): void;
}

// One line in a group: a whole habit, or one part of a habit (e.g. the breakfast part of "Meals").
type Item = { key: string; habit: DayHabit; part?: NonNullable<DayHabit["parts"]>[number] };
const isMarked = (i: Item) => (i.part ? Boolean(i.habit.partStates?.[i.part.id]) : i.habit.state !== null);

// Today's habits in groups: one per anchor of your day (what you do then, including each anchor's part of a
// habit with parts), then "Any time". The anchor you are in now comes first and opens by itself; the others
// stay folded until tapped. Habits not scheduled today are folded at the end. Long-press (or right-click) a
// habit to mark it "not applicable".
export function HabitList(props: Props) {
  const { date, place, habits } = props;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showRest, setShowRest] = useState(false);
  const due = habits.filter((h) => h.due && h.active);
  const rest = habits.filter((h) => !h.due || !h.active);
  const marked = due.filter((h) => h.state !== null).length;
  const anchors = [...place.anchors].sort((a, b) => a.time.localeCompare(b.time));
  const known = (id?: string) => anchors.some((a) => a.id === id);

  const groups: { key: string; title: string; time?: string; items: Item[] }[] = anchors.map((a) => ({
    key: a.id,
    title: a.label,
    time: a.time,
    items: [
      ...due.filter((h) => !h.parts?.length && h.after === a.id).map((h) => ({ key: h.id, habit: h })),
      ...due.flatMap((h) => (h.parts ?? []).filter((x) => x.anchor === a.id).map((part) => ({ key: `${h.id}/${part.id}`, habit: h, part }))),
    ],
  }));
  groups.push({
    key: "any",
    title: groups.some((g) => g.items.length) ? "Any time" : "Habits",
    items: [
      ...due.filter((h) => !h.parts?.length && !known(h.after)).map((h) => ({ key: h.id, habit: h })),
      ...due.flatMap((h) => (h.parts ?? []).filter((x) => !known(x.anchor)).map((part) => ({ key: `${h.id}/${part.id}`, habit: h, part }))),
    ],
  });
  // A group opens by itself when something in it is still open and its time has come (any time on past days).
  const now = new Date();
  const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  // Your routine order: groups in the order of the day; inside a group, what comes before the anchor
  // (negative offset), then the anchor itself, then what comes after (stable, so ties keep the list order).
  const offsetOf = (i: Item) => (i.part ? (i.part.offset ?? 0) : (i.habit.offset ?? 0));
  for (const g of groups) if (g.key !== "any") g.items.sort((a, b) => offsetOf(a) - offsetOf(b));
  // Open by themselves: the current anchor's group and "Any time" (while something is unmarked); on a past
  // day every group with something unmarked. Earlier and later anchors stay folded until tapped.
  const currentKey = date === localToday() ? [...groups].reverse().find((g) => g.time && g.time <= nowHm && g.items.length)?.key : undefined;
  const isOpen = (g: (typeof groups)[number]) =>
    open[g.key] ?? (g.items.some((i) => !isMarked(i)) && (date < localToday() || g.key === currentKey || g.key === "any"));

  return (
    <section aria-labelledby="habits-heading" className="card p-4 sm:p-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="habits-heading" className="font-serif text-xl text-ink">
          Habits
        </h2>
        <span className="text-xs text-ink-dim">
          {marked} of {due.length} logged
        </span>
      </div>
      {groups
        .filter((g) => g.items.length)
        .map((g) => {
          const done = g.items.filter(isMarked).length;
          const expanded = isOpen(g);
          return (
            <div key={g.key} className="habit-group">
              <button type="button" className="habit-group-title" aria-expanded={expanded} onClick={() => (feel(expanded ? "close" : "open"), setOpen({ ...open, [g.key]: !expanded }))}>
                <span className="habit-chevron" aria-hidden="true">
                  ›
                </span>
                {g.title} {g.time && <span>{g.time}</span>}
                <span className={`ml-auto ${done === g.items.length ? "text-brass" : ""}`}>
                  {done}/{g.items.length}
                </span>
              </button>
              {expanded && (
                <ul className="habit-group-list flex flex-col divide-y divide-ink-dim/10">
                  {g.items.map((i) => (
                    <HabitRow key={i.key} item={i} time={i.part ? null : habitTime(i.habit, date, place)} {...props} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      {rest.length > 0 && (
        <>
          <button type="button" className="mt-3 text-xs text-ink-dim underline-offset-4 hover:underline" onClick={() => setShowRest(!showRest)}>
            {showRest ? "Hide" : "Show"} {rest.length} not scheduled today
          </button>
          {showRest && (
            <ul className="mt-2 flex flex-col divide-y divide-ink-dim/10 opacity-80">
              {rest.map((h) => (
                <HabitRow key={h.id} item={{ key: h.id, habit: h }} time={habitTime(h, date, place)} {...props} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function HabitRow({ item, time, date, readOnly, missed, logged, onMark, onPart, onAmount, onReason }: { item: Item; time: string | null } & Props) {
  const { habit, part } = item;
  const state = part ? (habit.partStates?.[part.id] ?? null) : habit.state;
  const marks = part ? (habit.partMarks ?? ["done"]) : (habit.marks ?? DEFAULT_MARKS);
  const reason = part ? undefined : missed[habit.id];
  const loggedAt = part ? undefined : logged[habit.id];
  const meta = [part ? part.label : null, time && `⏰ ${time}`, habit.target, habit.unit && habit.goal ? `goal ${habit.goal} ${habit.unit}` : null].filter(Boolean).join(" · ");
  const set = (mark: Mark | null, button: Element | null) => (part ? onPart(habit.id, part.id, mark, button) : onMark(habit.id, mark, button));
  // Long-press (phone) or right-click (PC): not applicable today, or back.
  const notApplicable = (e: MouseEvent) => {
    if (part || readOnly) return;
    e.preventDefault();
    feel("select");
    onMark(habit.id, habit.state === "na" ? null : "na", e.currentTarget);
  };
  return (
    <li className={`habit-row ${marks.length <= 2 || part || habit.unit ? "habit-row-compact" : ""} ${state === "na" ? "habit-row-na" : ""}`} onContextMenu={notApplicable} title={part ? undefined : "Long-press: not applicable today"}>
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
        {state && late(date, loggedAt) && <p className="text-xs text-ink-dim">filled in later · {whenLabel(loggedAt!)}</p>}
      </div>
      {state === "na" ? (
        <button type="button" className="reason-chip" disabled={readOnly} onClick={(e) => onMark(habit.id, null, e.currentTarget)}>
          Not applicable ×
        </button>
      ) : habit.unit && !part ? (
        <Amount habit={habit} readOnly={readOnly} onAmount={onAmount} />
      ) : (
        <div className="habit-marks" role="group" aria-label={`${habit.label}${part ? ` ${part.label}` : ""}: mark`}>
          {MARKS.filter((m) => marks.includes(m.mark)).map((m) => (
            <button
              key={m.mark}
              type="button"
              title={part && m.mark === "missed" ? "Missed" : m.label}
              aria-label={m.label}
              aria-pressed={state === m.mark}
              disabled={readOnly}
              className={`mark-btn mark-${m.mark}`}
              onClick={(e) => set(state === m.mark ? null : m.mark, e.currentTarget)}
            >
              {m.icon}
            </button>
          ))}
        </div>
      )}
      {state === "missed" && !part && (
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

// A counted habit: − amount + (e.g. pages of a book); the mark follows the amount and the goal.
function Amount({ habit, readOnly, onAmount }: { habit: DayHabit; readOnly: boolean; onAmount: Props["onAmount"] }) {
  const value = habit.amount ?? null;
  const step = (d: number) => onAmount(habit.id, Math.max(0, (value ?? 0) + d));
  return (
    <div className="habit-amount" role="group" aria-label={`${habit.label}: ${habit.unit}`}>
      <button type="button" className="mark-btn" disabled={readOnly || !value} onClick={() => step(-1)} aria-label="One less">
        −
      </button>
      <input
        className="today-input habit-amount-input"
        inputMode="numeric"
        value={value ?? ""}
        placeholder="0"
        disabled={readOnly}
        aria-label={`${habit.unit} today`}
        onChange={(e) => onAmount(habit.id, e.target.value === "" ? null : Math.min(1000, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)))}
      />
      <span className="text-xs text-ink-dim">{habit.unit}</span>
      <button type="button" className="mark-btn" disabled={readOnly} onClick={() => step(1)} aria-label="One more">
        +
      </button>
    </div>
  );
}
