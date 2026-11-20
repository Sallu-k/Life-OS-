"use client";

import { useEffect, useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { calendarDate, SIGHTED } from "@/lib/calendar";
import { saveOrQueue } from "@/lib/offline";
import { savedSetup, type DaySetup } from "@/lib/anchors";
import { localToday } from "./types";

// The second calendar's date beside the usual one (when one is chosen in Settings). For calendars whose
// months follow a sighted moon, Today asks once around a month's end whether the date is right here.
export function SecondDate({ date, setup, onSetup }: { date: string; setup: DaySetup; onSetup(s: DaySetup): void }) {
  const d = setup.calendar ? calendarDate(date, setup.calendar, setup.calendarOffset) : null;
  const key = d ? `lifeos-calendar-ok:${setup.calendar}:${d.label.replace(/^\d+\s*/, "")}:${d.day === 1 ? "start" : "end"}` : "";
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    try {
      setAsk(Boolean(d && setup.calendar && SIGHTED.has(setup.calendar) && date === localToday() && [29, 30, 1].includes(d.day) && !localStorage.getItem(key)));
    } catch {
      setAsk(false);
    }
  }, [key, date, d, setup.calendar]);
  if (!d) return null;

  function answer(change: number) {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // asked again next time
    }
    setAsk(false);
    feel(change ? "saved" : "select");
    if (!change) return;
    const next = { ...setup, calendarOffset: Math.max(-2, Math.min(2, setup.calendarOffset + change)) };
    onSetup(savedSetup(next));
    void saveOrQueue("settings", { day: next }).catch(() => undefined);
  }

  return (
    <>
      <span className="text-sm text-ink-dim">· {d.label}</span>
      {ask && (
        <span className="date-ask text-xs text-ink-dim" role="group" aria-label="Is this date right?">
          Right where you are?
          <button type="button" className="chip text-xs" onClick={() => answer(-1)} aria-label="One day earlier">
            −1
          </button>
          <button type="button" className="chip text-xs" onClick={() => answer(0)}>
            Yes
          </button>
          <button type="button" className="chip text-xs" onClick={() => answer(1)} aria-label="One day later">
            +1
          </button>
        </span>
      )}
    </>
  );
}
