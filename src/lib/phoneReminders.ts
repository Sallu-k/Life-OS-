"use client";

// Real reminders on the Android app (they ring even when the app is closed), rebuilt every time Today or
// Plan loads, for the next 7 days: each habit at its reminder time; each open task at its time (or anchor),
// else 08:00 on its day. Like Tasks.org, a task's priority sets how it keeps reminding until it is done
// (RHYTHM: high every 30 min and it cannot be swiped away, medium every 2 h, 🔔 every 15 min; overdue ones
// too), up to the night lock, on one notification that rings again (TaskNag on the phone); deadlines (⚑) also the evening before; week
// and month tasks near the end of their week/month; start dates (🛫); one evening nudge for open and
// overdue tasks; a nightly "log your day". Task and habit reminders have Done and Snooze buttons
// (handled in lib/notificationActions.ts).
import { habitTime, taskTime, type DaySetup } from "./anchors";
import type { Day, Task } from "@/components/today/types";
import { isApp } from "./api";
import { cachedPlan, isDay, placeLabel, span } from "./plan";
import { keptCopy } from "./offline";
import { setTaskNags, type TaskNag } from "./device";

const MORNING = "08:00";
const DEADLINE_EVE = "20:00";
const NUDGE = "20:30";
// How often a task rings again until it is done (minutes), by priority; 🔔 (nag) beats priority. Low and
// no priority ring once. High ones also stay on screen until Done or Snooze.
export const RHYTHM: Record<string, number> = { high: 30, medium: 120, nag: 15 };
const BEFORE = 15; // a timed high-priority task also rings this many minutes before
// The evening routine counts back from the bedtime target (Settings, "Bedtime and rewards"):
// log the day 90 min before, the wind-down habit 60 min before, "lights out" 15 min before.
const ROUTINE = { log: 90, windDown: 60, lightsOut: 15 };
const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function at(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}
// `minutes` before the bedtime target on the evening of `date` (a target after midnight is the next day).
function beforeBed(date: string, by: string, minutes: number): Date {
  const [h] = by.split(":").map(Number);
  const bed = at(h < 12 ? addDays(date, 1) : date, by);
  return new Date(bed.getTime() - minutes * 60_000);
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dueOn(days: Day["habits"][number]["days"], date: string): boolean {
  if (!days || days === "daily") return true;
  const list = Array.isArray(days) ? days : days === "weekdays" ? ["mon", "tue", "wed", "thu", "fri"] : days === "weekends" ? ["sat", "sun"] : String(days).split(",");
  return list.map((d) => d.trim().slice(0, 3)).includes(WEEK[new Date(`${date}T12:00:00`).getDay()]);
}
// A stable positive 31-bit id from a string, so the same reminder keeps the same id.
export function idOf(key: string): number {
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

// What a reminder is about, so its Done button knows what to tick. `key` groups a task's nag reminders.
export type Extra = { kind: "task"; date: string; text: string; key: string } | { kind: "habit"; date: string; id: string; key: string } | { kind: "info"; key: string };
export interface Reminder {
  id: number;
  title: string;
  body: string;
  isExactNotification: boolean;
  actionTypeId?: string;
  extra: Extra;
  schedule: { at: Date; allowWhileIdle: boolean };
}

// One schedule at a time (Today can load twice in a row; overlapping cancel/schedule would clash).
let queue: Promise<string> = Promise.resolve("");
export function scheduleReminders(today: Day, place?: DaySetup): Promise<string> {
  queue = queue.then(() => schedule(today, place)).catch(() => "");
  return queue;
}

// Exact times need Android's "Alarms & reminders" permission. It is never asked for here (the system
// screen would pop up on every load); without it reminders still come, possibly a few minutes late.
// Settings has a button to allow it once (allowExactReminders).
export async function exactReminders(): Promise<boolean> {
  if (!isApp()) return true;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted";
}
export async function allowExactReminders(): Promise<boolean> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === "granted";
}

// The buttons under task and habit reminders.
let registered = false;
export async function registerActions() {
  if (registered || !isApp()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const actions = [
    { id: "done", title: "Done" },
    { id: "snooze", title: "Snooze 1 h" },
  ];
  await LocalNotifications.registerActionTypes({ types: [{ id: "task", actions }, { id: "habit", actions }] });
  registered = true;
}

// Snoozed reminders are kept on the device, so rebuilding the schedule does not drop them.
type Snoozed = Omit<Reminder, "schedule"> & { at: number };
const SNOOZE_KEY = "lifeos-snoozed";
export function snoozed(): Snoozed[] {
  try {
    return (JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "[]") as Snoozed[]).filter((r) => r.at > Date.now());
  } catch {
    return [];
  }
}
export function saveSnoozed(list: Snoozed[]) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(list));
  } catch {
    // storage blocked: the snooze still rings once
  }
}

async function schedule(today: Day, place?: DaySetup): Promise<string> {
  if (!isApp()) return "";
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const exact = await exactReminders();
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted" && (await LocalNotifications.requestPermissions()).display !== "granted") return "Notifications are turned off for LifeOS.";
  await registerActions().catch(() => undefined);

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });

  const now = Date.now();
  const list: Reminder[] = [];
  const add = (key: string, when: Date, title: string, body: string, extra: Extra = { kind: "info", key }) => {
    if (when.getTime() > now + 30_000)
      list.push({ id: idOf(key), title, body, isExactNotification: exact, ...(extra.kind !== "info" ? { actionTypeId: extra.kind } : {}), extra, schedule: { at: when, allowWhileIdle: true } });
  };

  // The bedtime and wind-down habits get the evening routine instead of their plain reminder.
  const sleep = keptCopy<{ sleep: { by: string; habit: string | null; windDown: string | null } }>("rewards")?.sleep ?? { by: "23:00", habit: null, windDown: null };
  const routine = new Set([sleep.habit, sleep.windDown].filter(Boolean));
  const label = (id: string) => today.habits.find((h) => h.id === id)?.label ?? id;
  for (let n = 0; n < 7; n++) {
    const date = addDays(today.date, n);
    const state = (id: string | null) => (n === 0 ? today.habits.find((h) => h.id === id)?.state : null);
    add(`night-${date}`, beforeBed(date, sleep.by, ROUTINE.log), "Log your day", "Tick your habits and write a line in your journal.");
    if (sleep.windDown && !state(sleep.windDown)) {
      const key = `habit-${sleep.windDown}-${date}`;
      add(key, beforeBed(date, sleep.by, ROUTINE.windDown), `Wind down: ${label(sleep.windDown)}`, "Screens away for the evening. Done ticks it.", { kind: "habit", date, id: sleep.windDown, key });
    }
    if (sleep.habit && !state(sleep.habit)) {
      const key = `habit-${sleep.habit}-${date}`;
      add(key, beforeBed(date, sleep.by, ROUTINE.lightsOut), `Lights out in 15 min`, `In bed by ${sleep.by}.`, { kind: "habit", date, id: sleep.habit, key });
    }
    for (const h of today.habits) {
      if (routine.has(h.id) || h.remind === false) continue; // placed in the routine only, no reminder
      const time = habitTime(h, date, place); // fixed time, or minutes after its anchor
      if (!h.active || !time || !dueOn(h.days, date)) continue;
      if (n === 0 && h.state !== null) continue; // already logged today
      const key = `habit-${h.id}-${date}`;
      add(key, at(date, time), h.label, h.target ? `Target: ${h.target}` : "Time for this habit", { kind: "habit", date, id: h.id, key });
    }
  }

  // Tasks: today's from the day itself (freshest), the rest from the plan kept on the device.
  const plan = cachedPlan();
  const end = addDays(today.date, 7);
  const open = today.tasks.filter((t) => !t.done);
  const days = (plan?.tasks ?? []).filter((t) => !t.done && isDay(t.date) && t.date > today.date && t.date <= end);
  const overdue = plan ? [...plan.overdue, ...plan.tasks].filter((t) => !t.done && (span(t.date)?.[1] ?? "9999") < today.date) : today.carried;
  // Tasks with a rhythm ring on the phone's own reminders (TaskNag) when the app has them; else as before.
  const nags = [...open, ...days].map((t) => nagOf(t, t.date, false, place)).filter((n): n is TaskNag => n !== null);
  for (const day of [today.date, addDays(today.date, 1)])
    for (const t of overdue) {
      const n = nagOf(t, day, true, place);
      if (n) nags.push(n);
    }
  const native = await setTaskNags(nags);
  const ringing = new Set(native ? nags.map((n) => `${n.date}|${n.text}`) : []);
  for (const t of [...open, ...days]) taskReminders(t, add, place, ringing.has(`${t.date}|${t.text}`));
  // Week and month tasks: a nudge near the end (Friday 18:00, or three days before the month ends).
  for (const t of (plan?.tasks ?? []).filter((x) => !x.done && !isDay(x.date))) {
    const last = span(t.date)?.[1];
    if (!last) continue;
    const day = addDays(last, t.date.startsWith("week:") ? -2 : -3);
    const key = `bucket-${t.date}-${t.text}`;
    if (day >= today.date && day <= end && (!t.start || t.start <= day))
      add(key, at(day, "18:00"), `${t.date.startsWith("week:") ? "This week" : "This month"}: ${t.text}`, `Still open · ${placeLabel(t.date, day)}`, { kind: "task", date: t.date, text: t.text, key });
  }
  // Tasks that start (🛫) in the next days.
  for (const t of [...(plan?.tasks ?? []), ...(plan?.someday ?? [])]) {
    if (t.done || !t.start || t.start <= today.date || t.start > end) continue;
    const key = `start-${t.date}-${t.text}`;
    add(key, at(t.start, MORNING), `Starts today: ${t.text}`, placeLabel(t.date, t.start), { kind: "task", date: t.date, text: t.text, key });
  }

  const stillOpen = open.length + overdue.length;
  if (stillOpen > 0)
    add(
      `nudge-${today.date}`,
      at(today.date, NUDGE),
      overdue.length ? `${stillOpen} task${stillOpen > 1 ? "s" : ""} open, ${overdue.length} overdue` : `${stillOpen} task${stillOpen > 1 ? "s" : ""} still open`,
      [...overdue, ...open].map((t) => t.text).slice(0, 3).join(" · "),
    );

  for (const s of snoozed()) {
    const { at: when, ...rest } = s;
    list.push({ ...rest, isExactNotification: exact, schedule: { at: new Date(when), allowWhileIdle: true } });
  }
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  return `${list.length} reminders set`;
}

// A task's reminders: at its time (its own, or at its anchor), else 08:00 on its day; a deadline also
// 20:00 the day before; "keep reminding" (🔔) every 15 minutes, four more times. Not before its start date.
// `ringing`: the phone rings it on its rhythm (nagOf), so only the "before" and deadline-eve ones are added.
function taskReminders(t: Task, add: (key: string, when: Date, title: string, body: string, extra?: Extra) => void, place: DaySetup | undefined, ringing: boolean) {
  if (t.start && t.start > t.date) return;
  const key = `task-${t.date}-${t.text}`;
  const extra: Extra = { kind: "task", date: t.date, text: t.text, key };
  const time = taskTime(t, t.date, place);
  const when = at(t.date, time ?? MORNING);
  const title = time ? `${t.deadline ? "Deadline" : "Task"}: ${t.text}` : `${t.deadline ? "Deadline today" : "Today"}: ${t.text}`;
  const body = time ? `Due now (${time})` : t.deadline ? "Last day to get it done" : "Planned for today";
  if (!ringing) {
    add(key, when, title, body, extra);
    if (t.nag) for (let i = 1; i <= 4; i++) add(`${key}-nag${i}`, new Date(when.getTime() + i * 15 * 60_000), title, `Reminder ${i + 1} of 5 · ${body}`, extra);
  }
  if (time && t.priority === "high") add(`${key}-before`, new Date(when.getTime() - BEFORE * 60_000), `In ${BEFORE} min: ${t.text}`, `High priority, due at ${time}`, { ...extra, key: `${key}-before` });
  if (t.deadline) add(`${key}-eve`, at(addDays(t.date, -1), DEADLINE_EVE), `Due tomorrow: ${t.text}`, time ? `By ${time} tomorrow` : "Deadline is tomorrow", { ...extra, key: `${key}-eve` });
}

// The night lock (Settings › Night lock) ends each day's rhythm; 22:30 before the first sync, 23:00 when off.
function nightOn(day: string): Date {
  const night = keptCopy<{ gate?: { night?: { from?: string; lateDay?: number | null; lateFrom?: string | null } | null } }>("settings")?.gate?.night;
  const late = night?.lateDay === new Date(`${day}T12:00:00`).getDay() && /^\d{2}:\d{2}$/.test(night?.lateFrom ?? "") ? night!.lateFrom! : null;
  const from = night === null ? "23:00" : late ?? (/^\d{2}:\d{2}$/.test(night?.from ?? "") ? night!.from! : "22:30");
  return at(from < "12:00" ? addDays(day, 1) : day, from);
}

// A task that keeps ringing on `day` until done (TaskNag), or null when its priority rings only once.
// Overdue tasks ring from the morning of `day`; the rest from their time (or 08:00) on their own day.
function nagOf(t: Task, day: string, overdue: boolean, place?: DaySetup): TaskNag | null {
  const every = t.nag ? RHYTHM.nag : t.priority ? RHYTHM[t.priority] : undefined;
  if (!every || (t.start && t.start > day)) return null;
  const time = overdue ? null : taskTime(t, t.date, place);
  const first = at(day, time ?? MORNING).getTime();
  const until = nightOn(day).getTime();
  if (first >= until) return null;
  const how = every >= 60 ? `every ${every / 60} h` : `every ${every} min`;
  const lead = t.priority === "high" ? "Important" : t.deadline ? "Deadline" : "Task";
  const when = overdue ? `Overdue (${placeLabel(t.date, day)})` : time ? `Due ${time}` : t.deadline ? "Last day to get it done" : "Planned for today";
  return { key: `nag-${day}-${t.date}-${t.text}`, date: t.date, text: t.text, title: `${lead}: ${t.text}`, body: `${when} · ${how} until done`, priority: t.priority ?? null, first, every, until, sticky: t.priority === "high" };
}
