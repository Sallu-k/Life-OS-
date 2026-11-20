"use client";

import { useEffect, useState } from "react";
import type { DaySetup } from "@/lib/anchors";
import { todayScore } from "./TodayRing";
import { localToday, type Day } from "./types";

// The calm top of Today: how much of today's habits is done (ring), the next anchor of your day, and tasks left.
export function TodaySummary({ day, place }: { day: Day; place: DaySetup }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const score = todayScore(day.habits) ?? 0;
  const pct = Math.round(score * 100);
  // Goal gradient: near the end, "only 2 left" pulls harder than a percentage (and never shows a long empty bar).
  const due = day.habits.filter((h) => h.due && h.active && h.state !== "na");
  const open = due.filter((h) => h.state === null).length;
  const isToday = day.date === localToday();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const next = isToday ? [...place.anchors].sort((a, b) => a.time.localeCompare(b.time)).find((a) => toMin(a.time) >= nowMin) : undefined;
  const inMin = next ? toMin(next.time) - nowMin : 0;
  const left = [...day.tasks, ...day.carried].filter((t) => !t.done).length;
  const c = 2 * Math.PI * 26;

  return (
    <section className="card today-summary" aria-label="Today at a glance">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="26" className="today-ring-track" style={{ strokeWidth: 6 }} />
        <circle cx="32" cy="32" r="26" className="today-ring-fill" style={{ strokeWidth: 6 }} strokeDasharray={`${c * score} ${c}`} transform="rotate(-90 32 32)" />
        <text x="32" y="37" textAnchor="middle" className="today-summary-pct">
          {pct}%
        </text>
      </svg>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm text-ink">
          {pct === 100 ? "Every habit done today" : open > 0 && open <= 3 ? `Only ${open} left to log today` : open === 0 ? `All ${due.length} logged today` : `${due.length - open} of ${due.length} habits logged`}
        </p>
        {next && (
          <p className="text-sm text-ink-dim">
            Next: <span className="text-ink">{next.label}</span> {next.time} · {inMin < 60 ? `in ${inMin} min` : `in ${Math.floor(inMin / 60)} h ${inMin % 60} min`}
          </p>
        )}
        <p className="text-sm text-ink-dim">{left === 0 ? "No tasks left" : `${left} task${left === 1 ? "" : "s"} left`}</p>
      </div>
    </section>
  );
}
