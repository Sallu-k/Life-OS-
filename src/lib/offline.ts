"use client";

// Offline-first Today for the phone: every day the app has seen is kept on the device, and every change
// goes into an outbox that is sent to the PC whenever it can be reached. Changes are small and safe to
// replay in order: set a habit mark, set fields of a day, add a task, change a task found by its text.
// If the same thing was changed on the PC meanwhile, the later send wins (the PC keeps a backup).
import type { Day } from "@/components/today/types";
import { api, isOffline, pcAway } from "./api";
import { isFuture, isLockedNow, lockTime } from "./dayRules";

export type Op =
  | { kind: "day"; date: string; body: Record<string, unknown> }
  | { kind: "taskAdd"; date: string; body: { text: string; time?: string; priority?: string; repeat?: string; deadline?: boolean } }
  | { kind: "taskEdit"; date: string; matchText: string; body: Record<string, unknown> }
  | { kind: "goals"; scope: "year" | "month" | "week"; id: string; goals: { text: string; status: string }[] }
  | { kind: "put"; path: string; body: unknown }; // any other save (weekly review, habit list)
// (A task's `date` may also be "someday": the list of tasks without a date.)

const DAY = (date: string) => `lifeos-day:${date}`;
const OUTBOX = "lifeos-outbox";
const LAST = "lifeos-last-day";

function get<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function put(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the change still goes to the outbox if possible.
  }
}

export const cachedDay = (date: string) => get<Day>(DAY(date));
export const saveDay = (day: Day) => {
  put(DAY(day.date), day);
  put(LAST, day.date);
};
export const outbox = () => get<Op[]>(OUTBOX) ?? [];

// A blank day built from the habit list of the most recent day we know, for days never opened before.
export function blankDay(date: string): Day | null {
  const last = get<string>(LAST);
  const known = last ? cachedDay(last) : null;
  if (!known) return null;
  const week = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${date}T12:00:00`).getDay()];
  const lockAt = lockTime(date, null);
  return {
    date,
    exists: false,
    finished: null,
    lockAt,
    locked: isLockedNow(lockAt),
    future: isFuture(date),
    logged: {},
    mood: null,
    sleep: null,
    missed: {},
    habits: known.habits.map((h) => {
      const days = !h.days || h.days === "daily" ? null : Array.isArray(h.days) ? h.days : h.days === "weekdays" ? ["mon", "tue", "wed", "thu", "fri"] : h.days === "weekends" ? ["sat", "sun"] : String(h.days).split(",");
      return { ...h, state: null, due: !days || days.map((d) => d.trim().slice(0, 3)).includes(week) };
    }),
    tasks: [],
    carried: known.carried.filter((t) => t.date < date),
    productivity: null,
    screenTime: null,
    pages: null,
    journal: "",
    keep: "",
    fun: [],
  };
}

// Sends queued changes in order. Stops quietly when the PC cannot be reached; drops a change the server
// refuses (and reports it) so one bad change never blocks the rest.
let flushing: Promise<{ sent: number; errors: string[] }> | null = null;
export function flush(force = false): Promise<{ sent: number; errors: string[] }> {
  if (flushing) return flushing;
  if (!force && pcAway()) return Promise.resolve({ sent: 0, errors: [] }); // tried a moment ago: no answer
  flushing = (async () => {
    let sent = 0;
    const errors: string[] = [];
    for (;;) {
      const [op, ...rest] = outbox();
      if (!op) break;
      try {
        if (op.kind === "day") await api(`day/${op.date}`, { method: "PUT", body: op.body });
        else if (op.kind === "taskAdd") await api("task", { method: "POST", body: { ...op.body, date: op.date } });
        else if (op.kind === "goals") await api(`goals/${op.scope}/${op.id}`, { method: "PUT", body: { goals: op.goals } });
        else if (op.kind === "put") await api(op.path, { method: "PUT", body: op.body });
        else await api("task", { method: "PUT", body: { ...op.body, date: op.date, matchText: op.matchText } });
        sent++;
      } catch (e) {
        if (isOffline(e)) break;
        errors.push((e as Error).message);
      }
      put(OUTBOX, rest);
    }
    return { sent, errors };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// Queue a change, apply it to the stored day right away, and try to send it.
export function queue(op: Op, updated: Day): void {
  saveDay(updated);
  put(OUTBOX, [...outbox(), op]);
  void flush();
}

// Queue a change that is not tied to one stored day (the Plan page keeps its own copy), and try to send it.
export function send(op: Op): void {
  put(OUTBOX, [...outbox(), op]);
  void flush();
}

// What is saved on this device for a day (or a blank day built from the habits): shown at once,
// before the PC answers.
export const savedDay = (date: string) => cachedDay(date) ?? blankDay(date);

// Loads a day: first sends anything queued, then asks the PC. Offline, it falls back to the stored day.
export async function loadDay(date: string): Promise<{ day: Day | null; online: boolean }> {
  await flush();
  try {
    const day = await api<Day>(`day/${date}`);
    if (outbox().length === 0) saveDay(day);
    return { day: outbox().length ? (cachedDay(date) ?? day) : day, online: true };
  } catch (e) {
    if (!isOffline(e)) throw e;
    return { day: cachedDay(date) ?? blankDay(date), online: false };
  }
}

// Reads something from the PC and keeps a copy on this device; when the PC cannot be reached, the copy
// is used instead (`saved: true`). For pages other than Today and Plan (weekly review, habit list, goals).
export async function readKept<T>(path: string): Promise<{ data: T | null; saved: boolean }> {
  const key = `lifeos-kept:${path}`;
  try {
    const data = await api<T>(path);
    put(key, data);
    return { data, saved: false };
  } catch (e) {
    if (!isOffline(e)) throw e;
    return { data: get<T>(key), saved: true };
  }
}
// The copy on this device only (shown at once, before the PC answers).
export const keptCopy = <T>(path: string) => get<T>(`lifeos-kept:${path}`);

// Saves a change: straight to the PC when it answers, else queued (and `queued: true`).
export async function saveOrQueue<T>(path: string, body: unknown): Promise<{ data: T | null; queued: boolean }> {
  try {
    return { data: await api<T>(path, { method: "PUT", body }), queued: false };
  } catch (e) {
    if (!isOffline(e)) throw e;
    put(OUTBOX, [...outbox(), { kind: "put", path, body }]);
    return { data: null, queued: true };
  }
}
