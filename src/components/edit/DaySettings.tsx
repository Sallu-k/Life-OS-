"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";
import { savedSetup, type Anchor, type DaySetup } from "@/lib/anchors";
import { CALENDARS, calendarDate } from "@/lib/calendar";

// "Your day": anchors (named times that habits and tasks can follow) and an optional second calendar
// beside the date. Saved in _system/settings.md as `day`.
export function DaySettings({ setup }: { setup: DaySetup }) {
  const [s, setS] = useState(setup);
  const [msg, setMsg] = useState("");
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const preview = s.calendar ? calendarDate(date, s.calendar, s.calendarOffset)?.label : null;
  const setAnchor = (i: number, change: Partial<Anchor>) => setS({ ...s, anchors: s.anchors.map((a, j) => (j === i ? { ...a, ...change } : a)) });

  async function save() {
    try {
      const saved = await api<{ day: DaySetup }>("settings", { method: "PUT", body: { day: s } });
      savedSetup(saved.day);
      setS(saved.day);
      feel("saved");
      setMsg("Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="card flex flex-col gap-4 p-5 text-sm">
      <h2 className="font-serif text-xl text-ink">Your day</h2>
      <p className="text-ink-dim">
        Anchors are named times of your day, like &ldquo;Wake up 06:30&rdquo; or &ldquo;After work 18:00&rdquo;. A habit or task can follow an anchor (&ldquo;15 minutes after Wake up&rdquo;); Today groups habits under their anchor and reminders follow it.
      </p>
      <ul className="flex flex-col gap-2">
        {s.anchors.map((a, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <input className="today-input min-w-0 flex-1" value={a.label} placeholder="Name, e.g. Wake up" onChange={(e) => setAnchor(i, { label: e.target.value })} aria-label="Anchor name" />
            <input className="today-input w-32" type="time" value={a.time} onChange={(e) => setAnchor(i, { time: e.target.value })} aria-label="Anchor time" />
            <button type="button" className="px-1 text-ink-dim hover:text-ink" aria-label={`Remove ${a.label}`} onClick={() => setS({ ...s, anchors: s.anchors.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="chip w-fit" onClick={() => setS({ ...s, anchors: [...s.anchors, { id: "", label: "", time: "07:00" }] })}>
        + Add anchor
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="edit-field">
          <span>Second calendar beside the date</span>
          <select className="today-input" value={s.calendar ?? ""} onChange={(e) => setS({ ...s, calendar: e.target.value || null })}>
            <option value="">None</option>
            {CALENDARS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {s.calendar && (
          <label className="edit-field">
            <span>Correction{preview ? ` (today: ${preview})` : ""}</span>
            <select className="today-input" value={s.calendarOffset} onChange={(e) => setS({ ...s, calendarOffset: Number(e.target.value) })}>
              {[-2, -1, 0, 1, 2].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "As calculated" : `${n > 0 ? "+" : ""}${n} day${Math.abs(n) > 1 ? "s" : ""}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="chip edit-primary" onClick={save}>
          Save
        </button>
        {msg && <span className="text-ink-dim">{msg}</span>}
      </div>
    </div>
  );
}
