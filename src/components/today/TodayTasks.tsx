"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useIsApp } from "@/lib/api";
import { cachedDay, send } from "@/lib/offline";
import { cachedPlan, groupTasks, loadPlan, savePlan, type Plan } from "@/lib/plan";
import { scheduleReminders } from "@/lib/phoneReminders";
import { takeTaskTicks, updateTaskWidget } from "@/lib/device";
import type { DaySetup } from "@/lib/anchors";
import { TaskRow, taskMeta, type OnEdit } from "@/components/plan/Agenda";
import { editInPlan, feelEdit, leavesList } from "@/components/plan/planEdits";
import { localToday, type Task } from "./types";

// Today's tasks card: Overdue · Today · This week · This month, to tick off. New tasks are planned on the
// Plan page. Today's own tasks come from the day (so ticks give XP there); the rest from the plan kept on
// this device (refreshed from the PC, which also keeps reminders for planned tasks up to date).
export function TodayTasks({ date, dayTasks, onDayEdit, place }: { date: string; dayTasks: Task[]; onDayEdit: OnEdit; place?: DaySetup }) {
  const app = useIsApp();
  const isToday = date === localToday();
  const [plan, setPlan] = useState<Plan | null>(null);
  const refresh = useCallback(() => {
    // Ticks made on the task widget while the PC was away go through the outbox first.
    const ticks = app ? takeTaskTicks() : Promise.resolve([]);
    ticks
      .then((list) => list.forEach((t) => send({ kind: "taskEdit", date: t.date, matchText: t.text, body: { done: t.done } })))
      .then(() => loadPlan())
      .then((r) => {
        if (r.plan) setPlan(r.plan);
        const today = cachedDay(localToday());
        if (app && today) return scheduleReminders(today, place);
      })
      .catch(() => undefined);
  }, [app, place]);
  useEffect(() => {
    setPlan(cachedPlan());
    refresh();
  }, [refresh]);

  // Other days: just that day's tasks.
  if (!isToday)
    return (
      <Card open={dayTasks.filter((t) => !t.done).length}>
        <ul className="flex flex-col divide-y divide-ink-dim/10">
          {dayTasks.length === 0 && <li className="py-2 text-sm text-ink-dim">No tasks on this day.</li>}
          {dayTasks.map((t) => (
            <TaskRow key={`${t.index}-${t.text}`} task={t} showPlace={false} onEdit={onDayEdit} compact />
          ))}
        </ul>
      </Card>
    );

  const base = plan ?? { tasks: [], overdue: [], someday: [] };
  const groups = groupTasks({ ...base, tasks: [...base.tasks.filter((t) => t.date !== date), ...dayTasks] }, true);
  if (app) syncWidget(date, groups);
  const onEdit: OnEdit = (t, changes, row) => {
    if (t.date === date) return onDayEdit(t, changes, row);
    if (!plan) return;
    feelEdit(changes, row);
    const next = editInPlan(plan, t, changes);
    const go = () => {
      setPlan(next);
      savePlan(next);
      send({ kind: "taskEdit", date: t.date, matchText: t.text, body: changes });
      setTimeout(refresh, 600);
    };
    if (leavesList(t, changes)) setTimeout(go, 380);
    else go();
  };
  return (
    <Card open={groups.reduce((n, g) => n + g.tasks.filter((t) => !t.done).length, 0)}>
      {groups.every((g) => g.tasks.length === 0) && <p className="py-2 text-sm text-ink-dim">Nothing to do today, this week or this month.</p>}
      {groups
        .filter((g) => g.tasks.length > 0)
        .map((g) => (
          <div key={g.key} className="mt-3 first:mt-0">
            <h3 className={`mb-1 text-xs uppercase tracking-[0.16em] ${g.key === "overdue" ? "text-copper" : "text-ink-dim"}`}>{g.title}</h3>
            <ul className="flex flex-col divide-y divide-ink-dim/10">
              {g.tasks.map((t) => (
                <TaskRow key={`${t.date}-${t.index}-${t.text}`} task={t} showPlace={g.key !== "today"} onEdit={onEdit} compact />
              ))}
            </ul>
          </div>
        ))}
    </Card>
  );
}

function Card({ open, children }: { open: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby="tasks-heading" className="card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="tasks-heading" className="font-serif text-xl text-ink">
          Tasks
        </h2>
        <span className="text-xs text-ink-dim">{open} open</span>
        <Link href="/plan/" className="chip edit-primary ml-auto text-xs">
          + Plan a task
        </Link>
      </div>
      {children}
    </section>
  );
}

// The task widget shows Overdue, Today and This week (not the month), sent when they change.
let lastWidget = "";
function syncWidget(date: string, groups: ReturnType<typeof groupTasks>) {
  const rows = groups
    .filter((g) => g.key !== "month")
    .flatMap((g) => g.tasks.map((t) => ({ date: t.date, text: t.text, done: t.done, meta: [g.key === "today" ? "" : g.title, ...taskMeta(t, false).slice(0, 2)].filter(Boolean).join(" · ") })));
  const key = JSON.stringify([date, rows]);
  if (key === lastWidget) return;
  lastWidget = key;
  void updateTaskWidget(date, rows);
}
