"use client";

// Phone-only extras (android/.../DevicePlugin.java): screen time from Android's usage record, and the
// home-screen widget (today's habits; ticks made on it come back here to go through the outbox).
import { getServerUrl, getToken, isApp } from "./api";
import { nightFromEvents } from "./sleep";

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
  screenEvents(o: { date: string }): Promise<{ events: { t: number; on: boolean }[] }>;
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
// The task widget: overdue, today's and this week's tasks (at most 25 rows).
export const updateTaskWidget = (date: string, tasks: { date: string; text: string; meta: string; done: boolean }[]) =>
  withDevice((p) => p.setTaskWidget({ date, tasks: tasks.slice(0, 25) }));
export const takeWidgetTicks = async () => (await withDevice((p) => p.takeWidgetTicks()))?.ticks ?? [];

export function updateWidget(date: string, habits: { id: string; label: string; state: string | null; due: boolean; active: boolean }[]) {
  return withDevice((p) =>
    p.setWidgetData({
      date,
      url: getServerUrl(),
      token: getToken(),
      habits: habits.filter((h) => h.due && h.active).map((h) => ({ id: h.id, label: h.label, state: h.state })),
    }),
  );
}
