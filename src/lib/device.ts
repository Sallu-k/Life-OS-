"use client";

// Phone-only extras (android/.../DevicePlugin.java): screen time from Android's usage record, and the
// home-screen widget (today's habits; ticks made on it come back here to go through the outbox).
import { getServerUrl, getToken, isApp } from "./api";
import { longestOff, nightFromEvents } from "./sleep";
import { applyAccent } from "./accent";

interface Device {
  usageAccess(): Promise<{ granted: boolean }>;
  openUsageSettings(): Promise<void>;
  screenTime(o: { date: string }): Promise<{ hours: number }>;
  setWidgetData(o: { date: string; url: string; token: string; habits: { id: string; label: string; state: string | null }[] }): Promise<void>;
  takeWidgetTicks(): Promise<{ ticks: { date: string; id: string; state: string | null; at: string }[] }>;
  pinWidget(o: { kind?: "tasks" }): Promise<{ asked: boolean }>;
  setTaskWidget(o: { date: string; tasks: { date: string; text: string; meta: string; done: boolean }[] }): Promise<void>;
  takeTaskTicks(): Promise<{ ticks: { date: string; text: string; done: boolean }[] }>;
  toBack(): Promise<void>;
  screenEvents(o: { date: string; fromHour?: number; toHour?: number }): Promise<{ events: { t: number; on: boolean }[] }>;
  gateStatus(): Promise<GateStatus>;
  gateEnable(o: { on: boolean }): Promise<GateStatus>;
  openGateNotification(): Promise<void>;
  openGateSettings(): Promise<void>;
  gateSync(o: { date?: string; times?: Record<string, string> }): Promise<void>;
  accentColors(): Promise<{ dark?: string; light?: string; dark2?: string; light2?: string }>;
}

// A Capacitor plugin object must never be the value of a promise (see lib/liveUpdate.ts).
let box: Promise<{ p: Device }> | null = null;
async function withDevice<T>(use: (p: Device) => Promise<T>): Promise<T | null> {
  if (!isApp()) return null;
  box ??= import("@capacitor/core").then(({ registerPlugin }) => ({ p: registerPlugin<Device>("LifeOSDevice") }));
  try {
    return await use((await box).p);
  } catch {
    return null; // older app without the plugin, or the call failed: the extra is simply skipped
  }
}

export const usageAccess = async () => (await withDevice((p) => p.usageAccess()))?.granted ?? false;
export const openUsageSettings = () => withDevice((p) => p.openUsageSettings());
export const phoneScreenHours = async (date: string) => (await withDevice((p) => p.screenTime({ date })))?.hours ?? null;
export const pinWidget = async (kind?: "tasks") => (await withDevice((p) => p.pinWidget(kind ? { kind } : {})))?.asked ?? false;
export const takeTaskTicks = async () => (await withDevice((p) => p.takeTaskTicks()))?.ticks ?? [];
export const toBack = () => withDevice((p) => p.toBack());
// Last night (ending on the morning of `date`), worked out from the screen's on/off moments.
export async function lastNight(date: string) {
  const r = await withDevice((p) => p.screenEvents({ date }));
  return r ? nightFromEvents(r.events, new Date(`${date}T00:00:00`).getTime()) : null;
}
// Bored time on `date`: the longest stretch the phone screen stayed off between 08:00 and 22:00 (or now).
export async function boredMinutes(date: string) {
  const r = await withDevice((p) => p.screenEvents({ date, fromHour: 8, toHour: 22 }));
  const midnight = new Date(`${date}T00:00:00`).getTime();
  return r ? longestOff(r.events, midnight + 8 * 3600_000, Math.min(midnight + 22 * 3600_000, Date.now())) : null;
}
// The task widget: overdue, today's and this week's tasks (at most 25 rows).
export const updateTaskWidget = (date: string, tasks: { date: string; text: string; meta: string; done: boolean }[]) =>
  withDevice((p) => p.setTaskWidget({ date, tasks: tasks.slice(0, 25) }));
export const takeWidgetTicks = async () => (await withDevice((p) => p.takeWidgetTicks()))?.ticks ?? [];

export function updateWidget(date: string, habits: { id: string; label: string; state: string | null; due: boolean; active: boolean; parts?: unknown[] }[]) {
  return withDevice((p) =>
    p.setWidgetData({
      date,
      url: getServerUrl(),
      token: getToken(),
      // Habits with parts (one tick per part) stay on Today: the widget can only tick a whole habit.
      habits: habits.filter((h) => h.due && h.active && !h.parts?.length).map((h) => ({ id: h.id, label: h.label, state: h.state })),
    }),
  );
}

// The Gate (GateService/GateActivity, an always-on service, not Accessibility): its switch and the two
// permissions it needs, opening the Android screen for a missing one, and sending its queued choices.
export interface GateStatus {
  on: boolean; // switched on and allowed: running
  enabled: boolean;
  overlay: boolean; // "Display over other apps"
  usage: boolean; // Usage access
}
export const gateStatus = () => withDevice((p) => p.gateStatus());
export const gateOn = async () => (await gateStatus())?.on ?? null;
export const gateEnable = (on: boolean) => withDevice((p) => p.gateEnable({ on }));
export const openGateNotification = () => withDevice((p) => p.openGateNotification());
export const openGateSettings = () => withDevice((p) => p.openGateSettings());
export const gateSync = (date?: string, times?: Record<string, string>) => withDevice((p) => p.gateSync({ date, times }));

// The phone's wallpaper colours (Material You, Android 12+) become the app's accent.
export async function syncPhoneAccent() {
  const c = await withDevice((p) => p.accentColors());
  if (c?.dark) applyAccent(c.dark, c.light ?? null, c.dark2 ?? null, c.light2 ?? null);
}
