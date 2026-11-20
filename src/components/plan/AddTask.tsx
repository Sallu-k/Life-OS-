"use client";

import { useState } from "react";
import { localToday } from "@/components/today/types";
import { placeLabel, SOMEDAY } from "@/lib/plan";
import { quickParse } from "@/lib/quickParse";
import { firstDay, parseRepeat } from "@/lib/repeat";
import { emptyDraft, PlaceChips, TaskFields, type Draft } from "./TaskFields";

export interface NewTask {
  date: string; // a day, "week:…", "month:…" or "someday"
  text: string;
  time: string;
  after: string;
  priority: string;
  repeat: string;
  deadline: boolean;
  start: string;
  nag: boolean;
  note: string;
  subtasks: { done: boolean; text: string }[];
}

// One line is enough: "Call bank tomorrow 5pm !high every week" (lib/quickParse.ts). What was understood
// shows as chips; the When chips and "More options" set the rest. Typed words win over the pickers.
export function AddTask({ onAdd }: { onAdd(task: NewTask): void }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [picked, setPicked] = useState(false); // a When chip was chosen by hand
  const [more, setMore] = useState(false);
  const p = quickParse(text);
  const today = localToday();
  const repeat = p.repeat ?? draft.repeat;
  // Where it goes: typed > picked > first day of a typed weekly repeat > today.
  const date = p.date ?? (picked ? draft.date : p.repeat ? firstDay(parseRepeat(p.repeat), today) : draft.date);
  const merged: NewTask = {
    ...draft,
    date,
    text: p.text,
    time: p.time ?? draft.time,
    after: p.after ?? draft.after,
    priority: p.priority ?? draft.priority,
    repeat: date === SOMEDAY ? "" : repeat,
    deadline: p.deadline || draft.deadline,
    start: p.start ?? draft.start,
    nag: p.nag || draft.nag,
  };

  function submit() {
    if (!merged.text) return;
    onAdd(merged);
    setText("");
    setDraft(emptyDraft());
    setPicked(false);
    setMore(false);
  }

  return (
    <form
      className="card flex flex-col gap-3 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex gap-2">
        <input
          className="today-input min-w-0 flex-1"
          placeholder="e.g. Call bank tomorrow 5pm !high"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Task"
          enterKeyHint="done"
        />
        <button type="submit" className="chip edit-primary" disabled={!merged.text}>
          Add
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-dim" aria-live="polite">
        <span className="badge">
          {merged.deadline ? "⚑ Due " : ""}
          {placeLabel(date, today)}
        </span>
        {p.found
          .filter((f) => !f.startsWith("📅") && !f.startsWith("⚑ due"))
          .map((f) => (
            <span key={f} className="badge">
              {f}
            </span>
          ))}
        {!text && <span>Type when, time, !high, every week, by fri, after &lt;anchor&gt;, nag… or pick below.</span>}
      </p>
      <PlaceChips value={date} onChange={(v) => (setPicked(true), setDraft({ ...draft, date: v }))} />
      <button type="button" className="w-fit text-xs text-ink-dim underline-offset-4 hover:text-ink hover:underline" aria-expanded={more} onClick={() => setMore(!more)}>
        {more ? "Fewer options" : "More options: time, anchor, repeat, start, note, steps"}
      </button>
      {more && <TaskFields draft={{ ...draft, date }} set={(d) => setDraft({ ...draft, ...d })} />}
    </form>
  );
}
