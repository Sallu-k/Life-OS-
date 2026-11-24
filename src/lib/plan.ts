"use client";

// The Plan page's data (GET /api/plan, see scripts/lib/plan.mjs) and small date helpers.
// The last plan seen is kept on the device, so the phone app shows it offline; changes go through
// the same outbox as Today (lib/offline.ts).
import type { Task } from "@/components/today/types";
import { localToday, shift } from "@/components/today/types";
import { api, isOffline } from "./api";
import { flush, outbox } from "./offline";

export type GoalStatus = "none" | "progress" | "done" | "not";
export interface Goal {
  text: string;
  status: GoalStatus;
}
export type Scope = "year" | "month" | "week";
export interface Plan {
  from: string;
  to: string;
  tasks: Task[]; // every task (open and done) from `from` to `to`
  overdue: Task[]; // open tasks from the 60 days before `from`
  someday: Task[];
  goals: Record<Scope, { id: string; goals: Goal[] }>;
}

export const SOMEDAY = "someday";
export const PLAN_DAYS = 365; // how far ahead the agenda reaches

const KEY = "lifeos-plan";
export function cachedPlan(): Plan | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Plan) : null;
  } catch {
    return null;
  }
}
export function savePlan(plan: Plan): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    // storage full or blocked: the page still works while open
  }
}

// Sends what is waiting, then asks the PC; offline, the copy on the device.
export async function loadPlan(): Promise<{ plan: Plan | null; online: boolean }> {
  const from = localToday();
  await flush();
  try {
    const plan = await api<Plan>(`plan?from=${from}&to=${shift(from, PLAN_DAYS)}`);
    if (outbox().length === 0) savePlan(plan);
    return { plan: outbox().length ? (cachedPlan() ?? plan) : plan, online: true };
  } catch (e) {
    if (!isOffline(e)) throw e;
    return { plan: cachedPlan(), online: false };
  }
}

// ---------- weeks and dates ----------
const pad = (n: number) => String(n).padStart(2, "0");

// ISO week id ("2026-W45") of a date, as scripts/lib/review.mjs works it out.
export function weekId(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4, 12);
  const firstThursday = new Date(jan4);
  firstThursday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 864e5));
  return `${thursday.getFullYear()}-W${pad(week)}`;
}

// The Monday of a week id.
export function weekMonday(id: string): string {
  const [y, w] = id.split("-W").map(Number);
  const jan4 = new Date(y, 0, 4, 12);
  jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7);
  return `${jan4.getFullYear()}-${pad(jan4.getMonth() + 1)}-${pad(jan4.getDate())}`;
}

// The year, month or week before/after `id`.
export function stepPeriod(scope: Scope, id: string, n: number): string {
  if (scope === "year") return String(Number(id) + n);
  if (scope === "month") {
    const d = new Date(Number(id.slice(0, 4)), Number(id.slice(5)) - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  return weekId(shift(weekMonday(id), 7 * n));
}

export function periodLabel(scope: Scope, id: string): string {
  if (scope === "year") return id;
  if (scope === "month") return new Date(Number(id.slice(0, 4)), Number(id.slice(5)) - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
  const monday = weekMonday(id);
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleString("en-GB", { day: "numeric", month: "short" });
  return `Week ${Number(id.slice(6))} · ${fmt(monday)} – ${fmt(shift(monday, 6))}`;
}

// "Today", "Tomorrow", "Wed 12 Nov" (with the year when it is not this year).
export function whenLabel(date: string): string {
  const today = localToday();
  if (date === today) return "Today";
  if (date === shift(today, 1)) return "Tomorrow";
  if (date === shift(today, -1)) return "Yesterday";
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
}

// The next Monday after today (for the "Next week" chip).
export function nextMonday(today = localToday()): string {
  const d = new Date(`${today}T12:00:00`);
  return shift(today, ((8 - d.getDay()) % 7) || 7);
}

// ---------- where a task lives, and grouping for Plan and Today ----------
export const isDay = (where: string) => /^\d{4}-\d{2}-\d{2}$/.test(where);
const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
const monthName = (month: string, withYear = true) =>
  new Date(`${month}-01T12:00:00`).toLocaleString("en-GB", { month: "long", ...(withYear ? { year: "numeric" } : {}) });

// The first and last day a task can be done on (a week task: Monday to Sunday). Someday: none.
export function span(where: string): [string, string] | null {
  if (isDay(where)) return [where, where];
  if (where.startsWith("week:")) {
    const monday = weekMonday(where.slice(5));
    return [monday, shift(monday, 6)];
  }
  if (where.startsWith("month:")) return [`${where.slice(6)}-01`, monthEnd(where.slice(6))];
  return null;
}

// "Today", "Wed 12 Nov", "This week", "Week 47", "November", "Someday".
export function placeLabel(where: string, today = localToday()): string {
  if (isDay(where)) return whenLabel(where);
  if (where.startsWith("week:")) {
    const id = where.slice(5);
    if (id === weekId(today)) return "Any day this week";
    if (id === weekId(shift(today, 7))) return "Any day next week";
    return `Week ${Number(id.slice(6))} (from ${whenLabel(weekMonday(id))})`;
  }
  if (where.startsWith("month:")) {
    const id = where.slice(6);
    return id === today.slice(0, 7) ? "Any time this month" : `Any time in ${monthName(id, id.slice(0, 4) !== today.slice(0, 4))}`;
  }
  return "Someday";
}

export interface TaskGroup {
  key: string;
  title: string;
  tasks: Task[];
}

// Groups tasks by when they are due. Full (Plan): Overdue · Today · Tomorrow · This week · Next week ·
// This month · later months · Starts later · Someday. Compact (Today): Overdue · Today · This week · This month.
export function groupTasks(plan: Pick<Plan, "tasks" | "overdue" | "someday">, compact: boolean, today = localToday()): TaskGroup[] {
  const sunday = span(`week:${weekId(today)}`)![1];
  const nextSunday = shift(sunday, 7);
  const monthLast = monthEnd(today.slice(0, 7));
  const seen = new Set<string>();
  const all = [...plan.overdue, ...plan.tasks].filter((t) => {
    const key = `${t.date}|${t.text}|${t.index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !t.done || t.date === today; // today's done tasks stay visible (struck through)
  });
  // Oldest first, then (like Tasks.org) higher priority first within the same day, then by time.
  const rank = (t: Task) => (t.priority ? { high: 0, medium: 1, low: 3 }[t.priority] : 2);
  const order = (t: Task) => `${span(t.date)?.[1] ?? "9999"}${isDay(t.date) ? "0" : "1"}${rank(t)}${t.time ?? "99"}`;
  all.sort((a, b) => order(a).localeCompare(order(b)));
  const started = (t: Task) => !t.start || t.start <= today;
  const groups: TaskGroup[] = [];
  const add = (key: string, title: string, test: (t: Task, last: string) => boolean) =>
    groups.push({ key, title, tasks: all.filter((t) => started(t) && !groups.some((g) => g.tasks.includes(t)) && test(t, span(t.date)![1])) });

  add("overdue", "Overdue", (t, last) => last < today && !t.done);
  add("today", "Today", (t) => t.date === today);
  if (!compact) add("tomorrow", "Tomorrow", (t) => t.date === shift(today, 1));
  add("week", "This week", (_t, last) => last <= sunday);
  if (!compact) add("next-week", "Next week", (_t, last) => last <= nextSunday);
  add("month", "This month", (_t, last) => last <= monthLast);
  if (!compact) {
    for (const month of [...new Set(all.map((t) => span(t.date)![1].slice(0, 7)).filter((m) => m > today.slice(0, 7)))].sort())
      add(`m-${month}`, monthName(month, month.slice(0, 4) !== today.slice(0, 4)), (_t, last) => last.startsWith(month));
    groups.push({ key: "later", title: "Starts later", tasks: all.filter((t) => !started(t)) });
    groups.push({ key: SOMEDAY, title: "Someday", tasks: plan.someday.filter((t) => !t.done && started(t)) });
  }
  return groups;
}
