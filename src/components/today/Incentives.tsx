"use client";

import { useCallback, useEffect, useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { keptCopy, readKept } from "@/lib/offline";
import { localToday, shift, type Day } from "./types";

// What GET /api/rewards answers (scripts/lib/rewards.mjs).
interface RewardDay {
  date: string;
  night: boolean;
  habits: string[]; // habits that earned reward time that day
  minutes: number;
  played: number;
  bedtime: string | null;
  states: Record<string, string>;
}
interface Rewards {
  bank: number; // minutes of reward time banked
  cap: number;
  per: { label: string; night: number; earn: Record<string, number> };
  sleep: { by: string; habit: string | null; windDown: string | null };
  today: RewardDay;
  week: RewardDay[]; // Monday to today
}

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Today, top: the core habits with their week, and the reward time earned by chosen habits and early nights.
export function Incentives({ day, game, onSave }: { day: Day; game: boolean; onSave(c: Partial<Day>): void }) {
  const [r, setR] = useState<Rewards | null>(null);
  const load = useCallback(() => {
    readKept<Rewards>("rewards").then(({ data }) => data && setR(data), () => undefined);
  }, []);
  useEffect(() => {
    setR(keptCopy<Rewards>("rewards"));
    load();
  }, [load]);
  // Refresh after a habit tick (what was earned may have changed).
  const marks = JSON.stringify(day.habits.map((h) => h.state));
  useEffect(() => {
    const t = setTimeout(load, 1200);
    return () => clearTimeout(t);
  }, [marks, load]);

  const core = day.habits.filter((h) => h.core && h.active);
  const rewardsOn = r !== null && game && (Object.keys(r.per.earn).length > 0 || r.sleep.habit !== null);
  if (core.length === 0 && !rewardsOn) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      {core.length > 0 && <CoreHabits habits={core} r={r} />}
      {rewardsOn && r && <RewardTime day={day} r={r} onSave={onSave} />}
    </div>
  );
}

function CoreHabits({ habits, r }: { habits: Day["habits"]; r: Rewards | null }) {
  const today = localToday();
  const week = r?.week ?? [];
  const lastNight = week.find((d) => d.date === shift(today, -1))?.bedtime ?? null;
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="core-heading">
      <h2 id="core-heading" className="font-serif text-xl text-ink">
        Core habits
      </h2>
      <ul className="flex flex-col gap-3">
        {habits.map((h) => {
          // This week's marks, with today's taken live from the day.
          const marks = week.map((d) => (d.date === today ? (h.state ?? "") : (d.states[h.id] ?? "")));
          const good = marks.filter((m) => m === "done" || m === "half").length;
          const target = h.weekly ?? 5;
          const extra = h.id === r?.sleep.habit ? (lastNight ? `Last night: ${lastNight}` : `By ${r.sleep.by}`) : null;
          return (
            <li key={h.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink">★ {h.label}</span>
                <span className={`text-xs ${good >= target ? "text-brass" : "text-ink-dim"}`}>
                  {good} of {target} this week{good >= target ? " · reached" : ""}
                </span>
              </div>
              <div className="core-week" aria-label={`This week: ${good} of ${target}`}>
                {DAYS.map((name, i) => (
                  <span key={name} className="core-day" data-mark={marks[i] ?? "future"} title={name}>
                    {name[0]}
                  </span>
                ))}
              </div>
              {extra && <span className="text-xs text-ink-dim">{extra}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Minutes of a reward you enjoy, earned by an early night and by the habits chosen in Settings.
function RewardTime({ day, r, onSave }: { day: Day; r: Rewards; onSave(c: Partial<Day>): void }) {
  const played = day.played ?? 0;
  // The bank as the PC worked it out, adjusted for what was logged here since.
  const bank = Math.max(0, r.bank - (played - r.today.played));
  const label = (id: string) => day.habits.find((h) => h.id === id)?.label ?? id;
  const use = (min: number) => {
    feel(min > 0 ? "select" : "unmark");
    onSave({ played: Math.max(0, played + min) });
  };
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="reward-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="reward-heading" className="font-serif text-xl text-ink">
          {r.per.label}
        </h2>
        <span className="font-serif text-2xl text-brass">{hm(bank)}</span>
      </div>
      <p className="text-sm text-ink-dim">{bank > 0 ? "Earned, guilt-free." : "Nothing banked yet: the habits below earn some."}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {Object.entries(r.per.earn).map(([id, minutes]) => (
          <li key={id} className={r.today.habits.includes(id) ? "text-ink" : "text-ink-dim"}>
            {r.today.habits.includes(id) ? "✓" : "○"} {label(id)} today · +{minutes} min
          </li>
        ))}
        {r.sleep.habit && r.per.night > 0 && (
          <li className="text-ink-dim">
            ○ In bed by {r.sleep.by} tonight · +{r.per.night} min
          </li>
        )}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="chip" onClick={() => use(30)}>
          Used 30 min
        </button>
        <button type="button" className="chip" onClick={() => use(60)}>
          Used 1 h
        </button>
        {played > 0 && (
          <button type="button" className="text-xs text-ink-dim underline-offset-4 hover:underline" onClick={() => use(-30)}>
            Used today: {hm(played)} · take back 30 min
          </button>
        )}
      </div>
    </section>
  );
}
