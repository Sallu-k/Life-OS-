"use client";

import { useEffect } from "react";
import { habitTime, taskTime, type DaySetup } from "@/lib/anchors";
import { cachedPlan } from "@/lib/plan";
import { shift, type Day } from "./types";

// While the Today page is open on the PC, shows a desktop notification when a habit's reminder time or a
// task's due time arrives and it is not done yet, and at 20:00 for deadlines (⚑) due tomorrow.
// (The phone app gets real alarms: lib/phoneReminders.ts.)
export function useReminders(day: Day | null, place?: DaySetup) {
  useEffect(() => {
    if (!day || typeof Notification === "undefined") return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => undefined);
    const shown = new Set<string>();
    const tick = () => {
      if (Notification.permission !== "granted") return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      for (const h of day.habits) {
        if (h.due && h.active && habitTime(h, day.date, place) === hhmm && h.state === null && !shown.has(`h-${h.id}`)) {
          shown.add(`h-${h.id}`);
          new Notification(`Habit: ${h.label}`, { body: h.target ? `Target: ${h.target}` : "Time for this habit", tag: `h-${h.id}` });
        }
      }
      for (const t of day.tasks) {
        if (!t.done && taskTime(t, day.date, place) === hhmm && !shown.has(`t-${t.index}`)) {
          shown.add(`t-${t.index}`);
          new Notification(`Task due: ${t.text}`, { body: "Still pending", tag: `t-${t.index}` });
        }
      }
      const tomorrow = shift(day.date, 1);
      if (hhmm === "20:00")
        for (const t of cachedPlan()?.tasks ?? []) {
          if (t.date === tomorrow && t.deadline && !t.done && !shown.has(`d-${t.text}`)) {
            shown.add(`d-${t.text}`);
            new Notification(`Due tomorrow: ${t.text}`, { body: t.time ? `By ${t.time} tomorrow` : "Deadline is tomorrow", tag: `d-${t.text}` });
          }
        }
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [day, place]);
}
