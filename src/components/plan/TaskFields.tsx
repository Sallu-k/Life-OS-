"use client";

import { localToday, shift } from "@/components/today/types";
import { savedSetup, splitAfter } from "@/lib/anchors";
import { isDay, nextMonday, placeLabel, SOMEDAY, weekId } from "@/lib/plan";
import { parseRepeat, repeatText, WEEKDAYS, type Repeat } from "@/lib/repeat";

// Everything about a task except its text: where/when, time or anchor, priority, repeat, deadline,
// start date, nag, note and steps. Used by the add box ("More options") and by a task's detail panel.
export interface Draft {
  date: string; // a day, "week:…", "month:…" or "someday"
  time: string;
  after: string; // "wake+10" (minutes after an anchor) or ""
  priority: string;
  repeat: string; // rule text or ""
  deadline: boolean;
  start: string;
  nag: boolean;
  note: string;
  subtasks: { done: boolean; text: string }[];
}

export const emptyDraft = (date = localToday()): Draft => ({ date, time: "", after: "", priority: "", repeat: "", deadline: false, start: "", nag: false, note: "", subtasks: [] });

const PRESETS: [string, string][] = [
  ["", "Once"],
  ["every day", "Daily"],
  ["every weekday", "Weekdays"],
  ["every week", "Weekly"],
  ["every month", "Monthly"],
  ["every year", "Yearly"],
];

// Quick "where" choices: days, a week or month without a day, or Someday.
export function placeChoices(today = localToday()): [string, string][] {
  const next = new Date(`${today.slice(0, 7)}-01T12:00:00`);
  next.setMonth(next.getMonth() + 1);
  return [
    [today, "Today"],
    [shift(today, 1), "Tomorrow"],
    [`week:${weekId(today)}`, "This week"],
    [`week:${weekId(nextMonday(today))}`, "Next week"],
    [`month:${today.slice(0, 7)}`, "This month"],
    [`month:${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`, "Next month"],
    [SOMEDAY, "Someday"],
  ];
}

export function PlaceChips({ value, onChange }: { value: string; onChange(v: string): void }) {
  const today = localToday();
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="When">
      {placeChoices(today).map(([v, label]) => (
        <button key={label} type="button" className="chip text-xs" aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
      <label className="chip plan-date text-xs" aria-pressed={isDay(value) && !placeChoices(today).some(([v]) => v === value)}>
        {isDay(value) && !placeChoices(today).some(([v]) => v === value) ? placeLabel(value) : "Pick a day"}
        <input type="date" min={today} value={isDay(value) ? value : ""} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Pick a day" />
      </label>
    </div>
  );
}

export function TaskFields({ draft, set, steps = true }: { draft: Draft; set(d: Partial<Draft>): void; steps?: boolean }) {
  const day = isDay(draft.date);
  const { id: anchor, offset } = draft.after ? splitAfter(draft.after) : { id: "", offset: 0 };
  const anchors = savedSetup().anchors;
  return (
    <div className="flex flex-col gap-3">
      {day && (
        <div className="plan-options">
          <label className="edit-field">
            <span>Time</span>
            <input className="today-input" type="time" value={draft.time} onChange={(e) => set({ time: e.target.value, after: "" })} />
          </label>
          {anchors.length > 0 && (
            <label className="edit-field">
              <span>Or after an anchor</span>
              <select className="today-input" value={anchor} onChange={(e) => set({ after: e.target.value ? `${e.target.value}${offset >= 0 ? "+" : ""}${offset}` : "", time: "" })}>
                <option value="">No</option>
                {anchors.map((a) => (
                  <option key={a.id} value={a.id}>
                    After {a.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {anchor && (
            <label className="edit-field">
              <span>Minutes after (minus = before)</span>
              <input className="today-input" type="number" min={-120} max={240} value={offset} onChange={(e) => set({ after: `${anchor}${Number(e.target.value) >= 0 ? "+" : ""}${Number(e.target.value) || 0}` })} />
            </label>
          )}
        </div>
      )}
      <div className="plan-options">
        <label className="edit-field">
          <span>Priority</span>
          <select className="today-input" value={draft.priority} onChange={(e) => set({ priority: e.target.value })}>
            <option value="">None · reminds once</option>
            <option value="high">⏫ High · every 30 min until done</option>
            <option value="medium">🔼 Medium · every 2 h until done</option>
            <option value="low">🔽 Low · reminds once</option>
          </select>
        </label>
        {draft.date !== SOMEDAY && <RepeatPicker value={draft.repeat} onChange={(repeat) => set({ repeat })} />}
        <label className="edit-field">
          <span>Start (hidden until)</span>
          <input className="today-input" type="date" value={draft.start} onChange={(e) => set({ start: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-dim">
        {day && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brass)]" checked={draft.deadline} onChange={(e) => set({ deadline: e.target.checked })} />⚑ Deadline (reminder the evening before)
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-[var(--brass)]" checked={draft.nag} onChange={(e) => set({ nag: e.target.checked })} />🔔 Keep reminding (every 15 min until done)
        </label>
      </div>
      <label className="edit-field">
        <span>Note</span>
        <textarea className="today-input min-h-16" value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder="Details, links, what done looks like…" />
      </label>
      {steps && <Steps list={draft.subtasks} onChange={(subtasks) => set({ subtasks })} />}
    </div>
  );
}

// Steps (subtasks): tick, rename, remove, add.
export function Steps({ list, onChange }: { list: { done: boolean; text: string }[]; onChange(l: { done: boolean; text: string }[]): void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-ink-dim">Steps</span>
      {list.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-[var(--brass)]" checked={s.done} onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} aria-label={`Done: ${s.text}`} />
          <input className="today-input min-w-0 flex-1 py-1" value={s.text} onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} aria-label="Step" />
          <button type="button" className="px-1 text-ink-dim hover:text-ink" aria-label={`Remove ${s.text}`} onClick={() => onChange(list.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <input
        className="today-input py-1"
        placeholder="Add a step and press Enter"
        onKeyDown={(e) => {
          const v = e.currentTarget.value.trim();
          if (e.key !== "Enter" || !v) return;
          e.preventDefault();
          onChange([...list, { done: false, text: v }]);
          e.currentTarget.value = "";
        }}
        aria-label="New step"
      />
    </div>
  );
}

// Once / daily / weekdays / weekly / monthly / yearly, or custom: every N units, on chosen weekdays,
// counted from when it was done, until a date.
function RepeatPicker({ value, onChange }: { value: string; onChange(v: string): void }) {
  const r = parseRepeat(value);
  const preset = PRESETS.some(([v]) => v === value) ? value : "custom";
  const change = (p: Partial<Repeat>) => onChange(repeatText({ ...(r ?? { n: 1, unit: "week", days: [], whenDone: false, until: null }), ...p }) ?? "");
  return (
    <div className="edit-field">
      <span>Repeat</span>
      <select className="today-input" value={preset} onChange={(e) => onChange(e.target.value === "custom" ? "every 2 weeks" : e.target.value)}>
        {PRESETS.map(([v, l]) => (
          <option key={l} value={v}>
            {l}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {r && (
        <div className="mt-2 flex flex-col gap-2 text-sm">
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              Every
              <input className="today-input w-16 py-1" type="number" min={1} max={99} value={r.n} onChange={(e) => change({ n: Math.max(1, Number(e.target.value) || 1) })} aria-label="How many" />
              <select className="today-input py-1" value={r.unit} onChange={(e) => change({ unit: e.target.value as Repeat["unit"], days: [] })} aria-label="Unit">
                <option value="day">days</option>
                <option value="week">weeks</option>
                <option value="month">months</option>
                <option value="year">years</option>
              </select>
            </div>
          )}
          {r.unit === "week" && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="On these days">
              {WEEKDAYS.map((d, i) => (
                <button key={d} type="button" className="goal-mark w-auto px-2 text-xs" aria-pressed={r.days.includes(i)} onClick={() => change({ days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i].sort() })}>
                  {d.slice(0, 2)}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-ink-dim">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brass)]" checked={r.whenDone} onChange={(e) => change({ whenDone: e.target.checked })} />
            Count from the day it was done
          </label>
          <label className="flex items-center gap-2 text-ink-dim">
            Until
            <input className="today-input py-1" type="date" value={r.until ?? ""} onChange={(e) => change({ until: e.target.value || null })} aria-label="Repeat until" />
          </label>
        </div>
      )}
    </div>
  );
}
