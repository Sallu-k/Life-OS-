"use client";

// Task changes on the device's copy of the plan, made at once (the PC gets the same change through the
// outbox). Shared by Plan and Today so a tick looks and sounds the same on both.
import { localToday, type Task } from "@/components/today/types";
import { feel } from "@/lib/feel/sounds";
import { isDay, SOMEDAY, type Plan } from "@/lib/plan";
import type { NewTask } from "./AddTask";

export function addToPlan(plan: Plan, t: NewTask): Plan {
  const task: Task = {
    ...t,
    time: t.time || null,
    after: t.after || null,
    priority: (t.priority || null) as Task["priority"],
    repeat: t.repeat || null,
    start: t.start || null,
    done: false,
    index: 999,
  };
  return t.date === SOMEDAY ? { ...plan, someday: [...plan.someday, task] } : { ...plan, tasks: [...plan.tasks, task] };
}

// A done week/month/someday task moves into today's note (the server does the same).
export function editInPlan(plan: Plan, t: Task, changes: Record<string, unknown>): Plan {
  const today = localToday();
  const without = (list: Task[]) => list.filter((x) => x !== t);
  const edit = (list: Task[]) => list.map((x) => (x === t ? ({ ...x, ...changes } as Task) : x));
  const moveTo = (changes.moveTo as string | undefined) ?? (changes.done === true && !isDay(t.date) ? today : undefined);
  if (changes.remove || moveTo) {
    const rest: Plan = { ...plan, tasks: without(plan.tasks), overdue: without(plan.overdue), someday: without(plan.someday) };
    if (!moveTo) return rest;
    const moved = { ...t, ...changes, date: moveTo } as Task;
    delete (moved as unknown as Record<string, unknown>).moveTo;
    return moveTo === SOMEDAY ? { ...rest, someday: [...rest.someday, moved] } : { ...rest, tasks: [...rest.tasks, moved] };
  }
  if (changes.done === true && t.date < today) return { ...plan, overdue: without(plan.overdue), tasks: edit(plan.tasks) };
  return { ...plan, tasks: edit(plan.tasks), overdue: edit(plan.overdue), someday: edit(plan.someday) };
}

// The sound (and the strike-through drawn across a ticked task).
export function feelEdit(changes: Record<string, unknown>, row: Element | null) {
  if (changes.remove) feel("remove");
  else if (changes.moveTo) feel("taskMove");
  else if (changes.done === true) {
    feel("taskDone");
    const text = row?.querySelector("[data-task-text]");
    text?.classList.remove("feel-strike");
    void (text as HTMLElement | undefined)?.offsetWidth;
    text?.classList.add("feel-strike");
  } else if (changes.done === false) feel("taskUndo");
  else feel("saved");
}

// A ticked task that leaves its list (overdue, week, month) waits for the strike-through first.
export const leavesList = (t: Task, changes: Record<string, unknown>) => changes.done === true && (!isDay(t.date) || t.date < localToday());
