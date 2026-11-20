"use client";

import { useEffect, useRef, useState } from "react";
import { useBackClose } from "@/lib/useBackClose";
import { keptCopy, readKept, saveOrQueue } from "@/lib/offline";
import { savedSetup } from "@/lib/anchors";
import { AREAS } from "./types";

interface HabitDef {
  id: string;
  label: string;
  active: boolean;
  area?: string;
  days?: string | string[];
  time?: string;
  difficulty?: string;
  target?: string;
  after?: string;
  offset?: number;
  core?: boolean;
  weekly?: number;
  marks?: string[];
  unit?: string;
  goal?: number;
  parts?: { id: string; label: string; anchor?: string }[];
  isNew?: boolean;
}

// What a habit records: which marks it offers, or an amount (scripts/lib/days.mjs writeHabits).
const KINDS: [string, string, Partial<HabitDef>][] = [
  ["all", "Done · half · showed up · not", { marks: undefined, unit: undefined, goal: undefined }],
  ["yesno", "Yes or no", { marks: ["done", "missed"], unit: undefined, goal: undefined }],
  ["showed", "Yes · showed up · no", { marks: ["done", "partial", "missed"], unit: undefined, goal: undefined }],
  ["count", "A number (e.g. pages)", { marks: undefined, unit: "pages" }],
];
const kindOf = (h: HabitDef) => (h.unit ? "count" : h.marks?.join() === "done,missed" ? "yesno" : h.marks?.join() === "done,partial,missed" ? "showed" : "all");

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const daysOf = (d: HabitDef["days"]): string[] =>
  !d || d === "daily" ? WEEK : d === "weekdays" ? WEEK.slice(0, 5) : d === "weekends" ? WEEK.slice(5) : (Array.isArray(d) ? d : String(d).split(",")).map((x) => x.trim().slice(0, 3));

// Set up habits: name, days, reminder time (or an anchor: reminded some minutes after that
// anchor), difficulty, target and life area. Ids never change once saved,
// so a renamed habit keeps its history.
export function HabitManager({ onClose }: { onClose(saved: boolean): void }) {
  const [list, setList] = useState<HabitDef[] | null>(null);
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useBackClose(true, () => dialog.current?.close()); // Android's Back closes this first

  useEffect(() => {
    dialog.current?.showModal();
    setList(keptCopy<HabitDef[]>("habits"));
    readKept<HabitDef[]>("habits").then(
      ({ data, saved }) => {
        if (data) setList(data);
        if (saved) setStatus(data ? "Offline: changes are saved on this phone and sent when the PC is reachable." : "The PC is not reachable and the habit list is not saved on this phone yet.");
      },
      (e: Error) => setStatus(e.message),
    );
  }, []);

  const update = (i: number, changes: Partial<HabitDef>) => setList((l) => l!.map((h, k) => (k === i ? { ...h, ...changes } : h)));

  async function save() {
    try {
      await saveOrQueue("habits", { habits: list!.map(({ isNew, ...h }) => ({ ...h, id: isNew ? h.label : h.id })) });
      onClose(true);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <dialog ref={dialog} className="edit-drawer" onClose={() => onClose(false)} aria-label="Set up habits">
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-ink-dim/15 p-4">
          <h2 className="font-serif text-xl text-ink">Set up habits</h2>
          <button type="button" className="chip" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {!list ? (
            <p className="text-sm text-ink-dim">{status || "Loading…"}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {list.map((h, i) => {
                const days = daysOf(h.days);
                return (
                  <li key={h.isNew ? `new-${i}` : h.id} className={`card flex flex-col gap-3 p-3 ${h.active ? "" : "opacity-60"}`}>
                    <div className="flex items-center gap-2">
                      <input className="today-input flex-1" value={h.label} onChange={(e) => update(i, { label: e.target.value })} aria-label="Name" />
                      <label className="flex items-center gap-1 text-xs text-ink-dim">
                        <input type="checkbox" checked={h.active} onChange={(e) => update(i, { active: e.target.checked })} title="Switch off to retire it: it leaves Today, its history is kept" />{" "}
                        {h.active ? "In use" : "Retired"}
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
                      {WEEK.map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={days.includes(d)}
                          className="chip px-2 text-[11px] capitalize"
                          onClick={() => {
                            const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
                            update(i, { days: next.length === 7 ? "daily" : WEEK.filter((x) => next.includes(x)) });
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input className="today-input" type="time" value={h.time ?? ""} onChange={(e) => update(i, { time: e.target.value })} aria-label="Reminder time" />
                      <select className="today-input" value={h.difficulty ?? ""} onChange={(e) => update(i, { difficulty: e.target.value })} aria-label="Difficulty">
                        <option value="">Difficulty</option>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                      <select className="today-input" value={h.area ?? ""} onChange={(e) => update(i, { area: e.target.value })} aria-label="Area">
                        {AREAS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <input className="today-input" placeholder="Target, e.g. 10 pages" value={h.target ?? ""} onChange={(e) => update(i, { target: e.target.value })} aria-label="Target" />
                    </div>
                    {h.parts?.length ? (
                      <p className="text-xs text-ink-dim">
                        One tick per part: {h.parts.map((p) => p.label).join(", ")} (set in _system/habits.md).
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <select className="today-input" value={kindOf(h)} onChange={(e) => update(i, KINDS.find(([k]) => k === e.target.value)![2])} aria-label="What it records">
                          {KINDS.map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {h.unit !== undefined && (
                          <>
                            <input className="today-input" value={h.unit} onChange={(e) => update(i, { unit: e.target.value })} aria-label="Unit" placeholder="pages" />
                            <label className="flex items-center gap-2 text-xs text-ink-dim">
                              <input className="today-input w-16" type="number" min={1} max={1000} value={h.goal ?? ""} onChange={(e) => update(i, { goal: Number(e.target.value) || undefined })} aria-label="Daily goal" />
                              a day = done
                            </label>
                          </>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <select className="today-input" value={h.after ?? ""} onChange={(e) => update(i, { after: e.target.value || undefined })} aria-label="Follows an anchor">
                        <option value="">No anchor</option>
                        {savedSetup().anchors.map((a) => (
                          <option key={a.id} value={a.id}>
                            After {a.label} ({a.time})
                          </option>
                        ))}
                      </select>
                      {h.after && (
                        <label className="flex items-center gap-2 text-xs text-ink-dim">
                          <input className="today-input w-20" type="number" min={-120} max={240} value={h.offset ?? 0} onChange={(e) => update(i, { offset: Number(e.target.value) })} aria-label="Minutes after the anchor" />
                          min after
                        </label>
                      )}
                      <label className="flex items-center gap-2 text-xs text-ink-dim" title="One of your few most important habits: a weekly target instead of a streak">
                        <input type="checkbox" checked={Boolean(h.core)} onChange={(e) => update(i, { core: e.target.checked, weekly: h.weekly ?? 5 })} />★ Core habit
                      </label>
                      {h.core && (
                        <label className="flex items-center gap-2 text-xs text-ink-dim">
                          <input className="today-input w-16" type="number" min={1} max={7} value={h.weekly ?? 5} onChange={(e) => update(i, { weekly: Number(e.target.value) })} aria-label="Days a week" />
                          days a week
                        </label>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t border-ink-dim/15 p-4">
          <button type="button" className="chip edit-primary" onClick={save} disabled={!list}>
            Save habits
          </button>
          <button type="button" className="chip" onClick={() => setList((l) => [...(l ?? []), { id: "", label: "New habit", active: true, isNew: true }])}>
            + Add habit
          </button>
          <span className="text-sm text-ink-dim">{status}</span>
        </footer>
      </div>
    </dialog>
  );
}
