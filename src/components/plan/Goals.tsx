"use client";

import { useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { periodLabel, stepPeriod, type Goal, type GoalStatus, type Scope } from "@/lib/plan";

const STATUS: { status: GoalStatus; icon: string; label: string }[] = [
  { status: "none", icon: "☐", label: "Open" },
  { status: "progress", icon: "◐", label: "In progress" },
  { status: "done", icon: "☑", label: "Done" },
  { status: "not", icon: "☒", label: "Not achieved" },
];
const TABS: [Scope, string][] = [
  ["year", "Year"],
  ["month", "Month"],
  ["week", "Week"],
];
const HINT: Record<Scope, string> = {
  year: "The few things this year is for.",
  month: "Month goals are also the monthly quests on Balance.",
  week: "What this week should move forward. Private, like the weekly review.",
};

// Year / month / week goals: add, set how it is going, remove; step to earlier or later periods.
export function Goals({
  ids,
  goals,
  onPeriod,
  onSave,
}: {
  ids: Record<Scope, string>; // the period shown for each tab
  goals: Record<Scope, Goal[] | null>; // null while loading
  onPeriod(scope: Scope, id: string): void;
  onSave(scope: Scope, id: string, goals: Goal[]): void;
}) {
  const [tab, setTab] = useState<Scope>("week");
  const [text, setText] = useState("");
  const id = ids[tab];
  const list = goals[tab];
  const save = (next: Goal[]) => onSave(tab, id, next);

  return (
    <section aria-labelledby="goals-heading" className="card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="goals-heading" className="font-serif text-xl text-ink">
          Goals
        </h2>
        <div className="flex gap-1" role="tablist" aria-label="Goals for">
          {TABS.map(([scope, label]) => (
            <button key={scope} type="button" role="tab" className="chip text-xs" aria-selected={tab === scope} aria-pressed={tab === scope} onClick={() => (feel("select"), setTab(scope))}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="chip text-xs" aria-label="Earlier" onClick={() => onPeriod(tab, stepPeriod(tab, id, -1))}>
          ←
        </button>
        <span className="flex-1 text-center text-sm text-ink">{periodLabel(tab, id)}</span>
        <button type="button" className="chip text-xs" aria-label="Later" onClick={() => onPeriod(tab, stepPeriod(tab, id, 1))}>
          →
        </button>
      </div>
      <p className="text-xs text-ink-dim">{HINT[tab]}</p>

      {list === null ? (
        <p className="text-sm text-ink-dim">Loading…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-ink-dim/10">
          {list.length === 0 && <li className="py-2 text-sm text-ink-dim">No goals yet.</li>}
          {list.map((g, i) => (
            <li key={`${i}-${g.text}`} className="feel-enter flex items-center gap-2 py-2">
              <span className={`min-w-0 flex-1 text-sm ${g.status === "done" ? "text-ink-dim line-through" : "text-ink"}`}>{g.text}</span>
              <div className="flex shrink-0 gap-1" role="group" aria-label={`How it is going: ${g.text}`}>
                {STATUS.map((s) => (
                  <button
                    key={s.status}
                    type="button"
                    className="goal-mark"
                    aria-pressed={g.status === s.status}
                    title={s.label}
                    aria-label={s.label}
                    onClick={() => {
                      if (g.status === s.status) return;
                      feel(s.status === "done" ? "taskDone" : "select");
                      save(list.map((x, j) => (j === i ? { ...x, status: s.status } : x)));
                    }}
                  >
                    {s.icon}
                  </button>
                ))}
              </div>
              <button type="button" className="px-1 text-ink-dim hover:text-ink" aria-label={`Remove ${g.text}`} onClick={() => confirm(`Remove "${g.text}"?`) && (feel("remove"), save(list.filter((_, j) => j !== i)))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || list === null) return;
          feel("taskAdd");
          save([...list, { text: text.trim(), status: "none" }]);
          setText("");
        }}
      >
        <input className="today-input min-w-0 flex-1" placeholder={`Add a ${tab} goal…`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Goal" />
        <button type="submit" className="chip edit-primary">
          Add
        </button>
      </form>
    </section>
  );
}
