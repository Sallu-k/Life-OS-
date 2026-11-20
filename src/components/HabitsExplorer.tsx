"use client";

import { useEffect, useState } from "react";
import { habitRows } from "@/lib/vault/habitWindow";
import { datesOfMonth, habitsUsed, monthName, monthRange, monthsWithData, summarise, type DayData } from "@/lib/vault/history";
import type { GoalStatus, HabitDefinition, MonthNote } from "@/lib/vault/types";
import { Chip } from "./Chip";
import { ConsistencyGrid } from "./ConsistencyGrid";
import { HabitHeatmap } from "./HabitHeatmap";
import { PeriodPicker } from "./PeriodPicker";
import { TrendChart } from "./TrendChart";
import { YearHeatmap } from "./YearHeatmap";

const GOAL_TEXT: Record<GoalStatus, { icon: string; label: string }> = {
  done: { icon: "☑", label: "Done" },
  not: { icon: "☒", label: "Not achieved" },
  progress: { icon: "◐", label: "In progress" },
  none: { icon: "☐", label: "No result marked" },
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex flex-col gap-1 px-4 py-3">
      <span className="text-xs uppercase tracking-[0.16em] text-ink-dim">{label}</span>
      <span className="font-serif text-2xl text-ink">{value}</span>
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
const hrs = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)} h`);

// The Habits page body: pick a month (or all time), see its habit grid, numbers, goals and ideas,
// then a year view per habit, monthly trends and consistency over every month.
export function HabitsExplorer({ habits, days, notes, current }: { habits: HabitDefinition[]; days: DayData[]; notes: MonthNote[]; current: string }) {
  // Every month with data, plus the current month (new tracking starts each month, even before the first entry).
  const months = [...new Set([...monthsWithData(days), current])].sort();
  const dataMonths = monthsWithData(days);
  const [period, setPeriod] = useState<string>(current);
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
  const [year, setYear] = useState<number>(years.at(-1) ?? new Date().getFullYear());
  const order = habits.map((h) => h.id);
  const used = habitsUsed(days, order);
  const [habit, setHabit] = useState<string>(used[0] ?? "");

  // The chosen month is kept in the address (#2024-08), so a link or refresh opens it again.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "all" || months.includes(hash)) {
      setPeriod(hash);
      if (hash !== "all") setYear(Number(hash.slice(0, 4)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function pick(key: string) {
    setPeriod(key);
    if (key !== "all") setYear(Number(key.slice(0, 4)));
    history.replaceState(null, "", `#${key}`);
  }


  const periods = [{ key: "all", label: "All time" }, ...months.map((m) => ({ key: m, label: monthName(m) }))];
  const shown = period === "all" ? days : days.filter((d) => d.date.startsWith(period));
  const stats = summarise(shown);
  const note = period === "all" ? null : notes.find((n) => n.month === period) ?? null;
  const monthRows = period === "all" ? [] : habitRows(habits, days, datesOfMonth(period));
  const tracked = monthRows.filter((r) => r.days.some((d) => d.state !== "unrecorded"));
  // A month with no entries yet shows the active habits with empty days, ready to fill.
  const rows = tracked.length > 0 ? tracked : monthRows.filter((r) => r.habit.active);
  const label = (id: string) => habits.find((h) => h.id === id)?.label ?? id;

  // Every calendar month from the first to the last, so months without a page show as gaps in the charts.
  const monthly = dataMonths.length === 0 ? [] : monthRange(dataMonths[0], dataMonths.at(-1)!).map((m) => ({ m, s: summarise(days.filter((d) => d.date.startsWith(m))) }));

  return (
    <div className="flex flex-col gap-14">
      <section aria-label="Choose a period" className="flex flex-col gap-6">
        <PeriodPicker periods={periods} value={period} onChange={pick} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={period === "all" ? "Days logged" : "Days logged"} value={String(stats.days)} />
          <Stat label="Avg productivity" value={pct(stats.productivity)} />
          <Stat label="Avg screen time" value={hrs(stats.screenTime)} />
          <Stat label="Pages read" value={stats.pages === null ? "—" : String(stats.pages)} />
        </div>

        {period !== "all" && (
          <>
            <h2 className="ornament font-serif text-2xl text-ink">{monthName(period)}</h2>
            {shown.length === 0 && (
              <p className="text-sm text-ink-dim">No entries yet this month. Tick your habits on the Today page (or in the daily note in Obsidian).</p>
            )}
            <HabitHeatmap rows={rows} />
          </>
        )}
      </section>

      {note && (note.goals.length > 0 || note.ideas.length > 0) && (
        <section aria-labelledby="goals-heading" className="grid gap-10 sm:grid-cols-2">
          <div>
            <h2 id="goals-heading" className="ornament mb-4 font-serif text-xl text-ink">
              Goals
            </h2>
            {note.goals.length === 0 ? (
              <p className="text-sm text-ink-dim">No goals written this month.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {note.goals.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="text-brass">
                      {GOAL_TEXT[g.status].icon}
                    </span>
                    <span>
                      {g.text} <span className="text-xs text-ink-dim">· {GOAL_TEXT[g.status].label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="ornament mb-4 font-serif text-xl text-ink">Ideas</h2>
            {note.ideas.length === 0 ? (
              <p className="text-sm text-ink-dim">No ideas written this month.</p>
            ) : (
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">
                {note.ideas.map((idea, i) => (
                  <li key={i}>{idea}</li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {used.length > 0 && (
        <section aria-labelledby="year-heading" className="flex flex-col gap-4">
          <h2 id="year-heading" className="ornament font-serif text-xl text-ink">
            A year of one habit
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Habit">
            {used.map((id) => (
              <Chip key={id} pressed={habit === id} onClick={() => setHabit(id)}>
                {label(id)}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Year">
            {years.map((y) => (
              <Chip key={y} pressed={year === y} onClick={() => setYear(y)}>
                {y}
              </Chip>
            ))}
          </div>
          <div className="card p-4 sm:p-6">
            <YearHeatmap year={year} habit={habit} label={label(habit)} days={days} />
          </div>
        </section>
      )}

      <section aria-labelledby="trend-heading" className="flex flex-col gap-6">
        <h2 id="trend-heading" className="ornament font-serif text-xl text-ink">
          Month by month
        </h2>
        <div className="card flex flex-col gap-8 p-4 sm:p-6">
          <TrendChart title="Average productivity (%)" kind="line" unit="%" points={monthly.map(({ m, s }) => ({ month: m, value: s.productivity }))} />
          <TrendChart title="Average screen time (hours a day)" kind="line" unit=" h" digits={1} points={monthly.map(({ m, s }) => ({ month: m, value: s.screenTime }))} />
          <TrendChart title="Pages read" kind="bar" unit=" pages" points={monthly.map(({ m, s }) => ({ month: m, value: s.pages }))} />
        </div>
      </section>

      <section aria-labelledby="consistency-heading" className="flex flex-col gap-4">
        <h2 id="consistency-heading" className="ornament font-serif text-xl text-ink">
          Consistency by month
        </h2>
        <p className="text-sm text-ink-dim">Darker means more consistent that month: done counts fully, half done a half, showed up a quarter. Blank means not tracked. Click a month to open it.</p>
        <ConsistencyGrid habits={used.map((id) => ({ id, label: label(id) }))} months={dataMonths} days={days} onPick={pick} />
      </section>
    </div>
  );
}
