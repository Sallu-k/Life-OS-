"use client";

import { useState } from "react";
import { localToday, type Task } from "@/components/today/types";
import { groupTasks, isDay, placeLabel, SOMEDAY, span, type Plan } from "@/lib/plan";
import { repeatLabel } from "@/lib/repeat";
import { anchorOf, savedSetup, splitAfter } from "@/lib/anchors";
import { PlaceChips, TaskFields, type Draft } from "./TaskFields";

const PRIORITY = { high: "⏫ High", medium: "🔼 Medium", low: "🔽 Low" } as const;

export type OnEdit = (task: Task, changes: Record<string, unknown>, row: Element | null) => void;

// "10 min after Wake up", "15 min before Lunch", "At After work".
export function afterLabel(after: string): string {
  const { id, offset: off } = splitAfter(after);
  const name = anchorOf(savedSetup(), id)?.label ?? id;
  return off === 0 ? `At ${name}` : off > 0 ? `${off} min after ${name}` : `${-off} min before ${name}`;
}

// The small grey line under a task.
export function taskMeta(t: Task, showPlace: boolean): string[] {
  const steps = t.subtasks?.length ? `☑ ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : null;
  return [
    showPlace && placeLabel(t.date),
    t.deadline && "⚑ Deadline",
    t.time && `⏰ ${t.time}`,
    t.after && `⚓ ${afterLabel(t.after)}`,
    t.repeat && `🔁 ${repeatLabel(t.repeat)}`,
    t.priority && PRIORITY[t.priority],
    t.start && t.start > localToday() && `🛫 from ${placeLabel(t.start)}`,
    t.nag && "🔔",
    steps,
    t.note && "📝",
  ].filter(Boolean) as string[];
}

export function Agenda({ plan, onEdit }: { plan: Pick<Plan, "tasks" | "overdue" | "someday">; onEdit: OnEdit }) {
  const groups = groupTasks(plan, false);
  const empty = groups.every((g) => g.tasks.length === 0);
  return (
    <section aria-labelledby="agenda-heading" className="card p-4 sm:p-5">
      <h2 id="agenda-heading" className="mb-2 font-serif text-xl text-ink">
        Agenda
      </h2>
      {empty && <p className="py-2 text-sm text-ink-dim">Nothing planned yet. Add a task above: a day, a week, a month or someday.</p>}
      {groups
        .filter((g) => g.tasks.length > 0)
        .map((g) => (
          <div key={g.key} className="mt-4 first:mt-0">
            <h3 className={`mb-1 text-xs uppercase tracking-[0.16em] ${g.key === "overdue" ? "text-copper" : "text-ink-dim"}`}>
              {g.title} <span className="normal-case tracking-normal">· {g.tasks.filter((t) => !t.done).length}</span>
            </h3>
            <ul className="flex flex-col divide-y divide-ink-dim/10">
              {g.tasks.map((t) => (
                <TaskRow key={`${t.date}-${t.index}-${t.text}`} task={t} showPlace={g.key !== "today" && g.key !== "tomorrow"} onEdit={onEdit} />
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}

// One task: tick it, tap it for details. `compact` (Today): no move button, details hold the note and steps.
export function TaskRow({ task, showPlace, onEdit, compact = false }: { task: Task; showPlace: boolean; onEdit: OnEdit; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const today = localToday();
  const someday = task.date === SOMEDAY;
  const late = !task.done && (span(task.date)?.[1] ?? "9999") < today;
  const meta = taskMeta(task, showPlace);
  return (
    <li className="feel-enter py-2">
      <div className="plan-row">
        {!someday && (
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-[var(--brass)]"
            checked={task.done}
            onChange={(e) => onEdit(task, { done: e.target.checked }, e.currentTarget.closest("li"))}
            aria-label={`Done: ${task.text}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <button type="button" data-task-text data-done={task.done} className="task-text text-left text-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            {task.text}
          </button>
          {meta.length > 0 && <p className={`text-xs ${late ? "text-copper" : "text-ink-dim"}`}>{meta.join(" · ")}</p>}
        </div>
        {!task.done && (late || (!compact && !isDay(task.date))) && (
          <div className="plan-row-actions">
            <button type="button" className="chip text-xs" onClick={(e) => onEdit(task, { moveTo: today }, e.currentTarget.closest("li"))}>
              To today
            </button>
          </div>
        )}
      </div>
      {open && (compact ? <StepsOnly task={task} onEdit={onEdit} /> : <Details task={task} onEdit={onEdit} close={() => setOpen(false)} />)}
    </li>
  );
}

// Today: read the note and tick steps; everything else is edited on Plan.
function StepsOnly({ task, onEdit }: { task: Task; onEdit: OnEdit }) {
  const steps = task.subtasks ?? [];
  return (
    <div className="ml-8 mt-2 flex flex-col gap-1 text-sm">
      {task.note && <p className="whitespace-pre-line text-ink-dim">{task.note}</p>}
      {steps.map((s, i) => (
        <label key={i} className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-[var(--brass)]" checked={s.done} onChange={(e) => onEdit(task, { subtasks: steps.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) }, null)} />
          <span className={s.done ? "text-ink-dim line-through" : "text-ink"}>{s.text}</span>
        </label>
      ))}
      {!task.note && !steps.length && <p className="text-ink-dim">No steps or note. Change the task on the Plan page.</p>}
    </div>
  );
}

// Plan: change anything about the task, then Save (sent to the PC as one change).
function Details({ task, onEdit, close }: { task: Task; onEdit: OnEdit; close(): void }) {
  const [text, setText] = useState(task.text);
  const [draft, setDraft] = useState<Draft>({
    date: task.date,
    time: task.time ?? "",
    after: task.after ?? "",
    priority: task.priority ?? "",
    repeat: task.repeat ?? "",
    deadline: Boolean(task.deadline),
    start: task.start ?? "",
    nag: Boolean(task.nag),
    note: task.note ?? "",
    subtasks: task.subtasks ?? [],
  });
  function save(e: React.MouseEvent) {
    const changes: Record<string, unknown> = { ...draft, text };
    delete changes.date;
    if (draft.date !== task.date) changes.moveTo = draft.date;
    onEdit(task, changes, (e.currentTarget as Element).closest("li"));
    close();
  }
  return (
    <div className="plan-details mt-3 flex flex-col gap-3">
      <input className="today-input" value={text} onChange={(e) => setText(e.target.value)} aria-label="Task text" />
      <PlaceChips value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
      <TaskFields draft={draft} set={(d) => setDraft({ ...draft, ...d })} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="chip edit-primary" onClick={save}>
          Save
        </button>
        <button type="button" className="chip" onClick={close}>
          Cancel
        </button>
        <button type="button" className="chip ml-auto" onClick={(e) => confirm(`Delete "${task.text}"?`) && onEdit(task, { remove: true }, (e.currentTarget as Element).closest("li"))}>
          Delete
        </button>
      </div>
    </div>
  );
}
