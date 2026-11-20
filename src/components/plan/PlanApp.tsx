"use client";

import { useCallback, useEffect, useState } from "react";
import { useIsApp, useServer } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";
import { cachedDay, outbox, readKept, send } from "@/lib/offline";
import { cachedPlan, loadPlan, savePlan, type Goal, type Plan, type Scope } from "@/lib/plan";
import { scheduleReminders } from "@/lib/phoneReminders";
import { savedSetup } from "@/lib/anchors";
import { localToday, type Task } from "@/components/today/types";
import { AddTask, type NewTask } from "./AddTask";
import { Agenda } from "./Agenda";
import { Goals } from "./Goals";
import { addToPlan, editInPlan, feelEdit, leavesList } from "./planEdits";

// The Plan page: tasks on any date (with times, deadlines and repeats), a Someday list, and goals for the
// year, month and week. Loaded live from the LifeOS server; the phone app keeps a copy and queues changes.
// `tasksOnly` (Today's Tasks tab): the add box and every open task, deadlines first; no goals.
export function PlanApp({ tasksOnly = false }: { tasksOnly?: boolean }) {
  const server = useServer();
  const app = useIsApp();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState("");
  // Which year/month/week each goals tab shows, and goals fetched for other periods.
  const [ids, setIds] = useState<Record<Scope, string> | null>(null);
  const [other, setOther] = useState<Record<string, Goal[] | null>>({});

  const load = useCallback(() => {
    loadPlan().then(
      (r) => {
        setPlan(r.plan);
        setOnline(r.online);
        setLoaded(true);
        setError("");
        if (r.plan) setIds((cur) => cur ?? { year: r.plan!.goals.year.id, month: r.plan!.goals.month.id, week: r.plan!.goals.week.id });
        // Reminders include planned tasks: rebuild them (needs today's habits, kept by the Today page).
        const today = cachedDay(localToday());
        if (app && today) scheduleReminders(today, savedSetup(null)).catch(() => undefined);
      },
      (e: Error) => (setError(e.message), setLoaded(true)),
    );
  }, [app]);
  // The plan saved on this device straight away; the PC's copy replaces it when it answers.
  useEffect(() => {
    if (!app) return;
    const saved = cachedPlan();
    if (saved) {
      setPlan((p) => p ?? saved);
      setIds((cur) => cur ?? { year: saved.goals.year.id, month: saved.goals.month.id, week: saved.goals.week.id });
      setLoaded(true);
    }
  }, [app]);
  useEffect(() => {
    if (server || app) load();
  }, [server, app, load]);
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);

  if (!app && server === null) return <p className="text-ink-dim">Connecting…</p>;
  if (!app && server === false)
    return (
      <p className="card p-5 text-sm text-ink-dim">
        Plan works through the LifeOS server. On the PC run <code>npm start</code> and open the address it prints. On the phone, use the LifeOS app.
      </p>
    );
  if (!plan)
    return <p className="text-ink-dim">{!loaded ? "Loading…" : error || "Can't reach the PC yet and no plan is saved on this device. Open Settings and tap Connect to my PC."}</p>;

  // Show a change at once (and keep it on the device), queue it for the PC, then refresh.
  function apply(next: Plan, op: Parameters<typeof send>[0]) {
    setPlan(next);
    savePlan(next);
    send(op);
    setTimeout(load, 400);
  }

  function addTask(t: NewTask) {
    if (!plan) return;
    feel("taskAdd");
    const { date, ...body } = t;
    apply(addToPlan(plan, t), { kind: "taskAdd", date, body });
  }

  function editTask(t: Task, changes: Record<string, unknown>, row: Element | null) {
    if (!plan) return;
    feelEdit(changes, row);
    const next = editInPlan(plan, t, changes);
    const op = { kind: "taskEdit" as const, date: t.date, matchText: t.text, body: changes };
    if (leavesList(t, changes)) setTimeout(() => apply(next, op), 380);
    else apply(next, op);
  }

  const goalsFor = (scope: Scope): Goal[] | null => {
    if (!ids || !plan) return null;
    const current = plan.goals[scope];
    return ids[scope] === current.id ? current.goals : (other[`${scope}:${ids[scope]}`] ?? null);
  };
  function showPeriod(scope: Scope, id: string) {
    if (!ids || !plan) return;
    feel("select");
    setIds({ ...ids, [scope]: id });
    const key = `${scope}:${id}`;
    if (id === plan.goals[scope].id || key in other) return;
    setOther((o) => ({ ...o, [key]: null }));
    readKept<{ goals: Goal[] }>(`goals/${scope}/${id}`).then(
      (r) => setOther((o) => ({ ...o, [key]: r.data?.goals ?? [] })), // offline: the copy last seen on this phone
      () => setOther((o) => ({ ...o, [key]: [] })),
    );
  }
  function saveGoals(scope: Scope, id: string, goals: Goal[]) {
    if (!plan) return;
    const op = { kind: "goals" as const, scope, id, goals };
    if (id === plan.goals[scope].id) apply({ ...plan, goals: { ...plan.goals, [scope]: { id, goals } } }, op);
    else {
      setOther((o) => ({ ...o, [`${scope}:${id}`]: goals }));
      send(op);
    }
  }

  const waiting = outbox().length;
  return (
    <div className="flex flex-col gap-6">
      {(!online || waiting > 0) && (
        <p className="text-xs text-ink-dim" role="status">
          {!online ? "Offline: showing the plan saved on this phone. Changes are sent when the PC is reachable." : `Sending ${waiting} change${waiting > 1 ? "s" : ""}…`}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-6">
          <AddTask onAdd={addTask} />
          <Agenda plan={plan} onEdit={editTask} deadlinesFirst={tasksOnly} />
        </div>
        <div className="flex flex-col gap-6">
          {ids && !tasksOnly && <Goals ids={ids} goals={{ year: goalsFor("year"), month: goalsFor("month"), week: goalsFor("week") }} onPeriod={showPeriod} onSave={saveGoals} />}
        </div>
      </div>
    </div>
  );
}
