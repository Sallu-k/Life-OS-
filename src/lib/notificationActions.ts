"use client";

// The Done and Snooze buttons on phone reminders (lib/phoneReminders.ts). Android opens the app to run
// them; the change goes through the outbox like any other, and if the app was only opened for the button,
// it goes back to the background right away (so it feels like it never opened).
import { isApp } from "./api";
import { stamp } from "./dayRules";
import { toBack } from "./device";
import { send } from "./offline";
import { idOf, saveSnoozed, snoozed, type Extra } from "./phoneReminders";

const SNOOZE_MS = 60 * 60_000;
let visibleSince = Date.now();
let started = false;

export function listenForActions(): void {
  if (started || !isApp()) return;
  started = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") visibleSince = Date.now();
  });
  void import("@capacitor/local-notifications").then(({ LocalNotifications }) =>
    LocalNotifications.addListener("localNotificationActionPerformed", async (a) => {
      const extra = a.notification.extra as Extra | undefined;
      if (!extra || extra.kind === "info" || (a.actionId !== "done" && a.actionId !== "snooze")) return;
      if (a.actionId === "done") {
        if (extra.kind === "task") send({ kind: "taskEdit", date: extra.date, matchText: extra.text, body: { done: true } });
        else send({ kind: "day", date: extra.date, body: { habits: { [extra.id]: "done" }, at: stamp() } });
        // The task's other reminders (nag repeats, snoozes) are not needed any more.
        const pending = await LocalNotifications.getPending();
        const same = pending.notifications.filter((n) => (n.extra as Extra | undefined)?.key === extra.key);
        if (same.length) await LocalNotifications.cancel({ notifications: same.map((n) => ({ id: n.id })) });
        saveSnoozed(snoozed().filter((s) => s.extra.key !== extra.key));
      } else {
        const when = Date.now() + SNOOZE_MS;
        const again = { id: idOf(`${extra.key}-snooze-${when}`), title: a.notification.title, body: `Snoozed · ${a.notification.body ?? ""}`.trim(), isExactNotification: false, actionTypeId: extra.kind, extra };
        saveSnoozed([...snoozed(), { ...again, at: when }]);
        await LocalNotifications.schedule({ notifications: [{ ...again, schedule: { at: new Date(when), allowWhileIdle: true } }] });
      }
      // Opened just for this button (the page became visible a moment ago): back to where you were.
      setTimeout(() => Date.now() - visibleSince < 8000 && void toBack(), 700);
    }),
  );
}
