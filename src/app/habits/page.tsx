import { YearSquares } from "@/components/YearSquares";
import { yearSquares } from "@/lib/vault/insights";
import type { Metadata } from "next";
import { HabitsExplorer } from "@/components/HabitsExplorer";
import { HabitOverview } from "@/components/HabitOverview";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Prose";
import { VaultWarnings } from "@/components/VaultWarnings";
import { dayLabel } from "@/lib/format";
import { loadDaily } from "@/lib/vault/daily";
import { loadHabitDefinitions } from "@/lib/vault/habits";
import { toYmd } from "@/lib/vault/habitWindow";
import type { DayData } from "@/lib/vault/history";
import { loadMonthNotes } from "@/lib/vault/months";

export const metadata: Metadata = { title: "Habits" };

export default function HabitsPage() {
  const defs = loadHabitDefinitions();
  const daily = loadDaily(defs.items);
  const notes = loadMonthNotes();
  const warnings = [...defs.warnings, ...daily.warnings, ...notes.warnings];

  // Only habit marks and the three numbers go to the browser. Keep lines are shown separately below.
  const days: DayData[] = daily.items.map((d) => ({ date: d.date, habits: d.habits, productivity: d.productivity, screenTime: d.screenTime, pages: d.pages }));
  const kept = daily.items
    .flatMap((r) => r.keepLines.map((text) => ({ date: r.date, text })))
    .reverse()
    .slice(0, 10);

  return (
    <main data-theme="minimal" className="mx-auto w-full max-w-5xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Rhythm" title="Habits" stats={[`${days.length} days logged`, "no streaks, no pressure"]} />

      <HabitOverview habits={defs.items} records={daily.items} />
      <div className="h-10" />
      <HabitsExplorer habits={defs.items} days={days} notes={notes.items} current={toYmd(new Date()).slice(0, 7)} />

      <section className="mt-16 flex flex-col gap-4" aria-labelledby="year-squares-heading">
        <h2 id="year-squares-heading" className="ornament font-serif text-xl text-ink">
          {new Date().getFullYear()} in squares
        </h2>
        <div className="card overflow-x-auto p-4 sm:p-6">
          <YearSquares year={new Date().getFullYear()} squares={yearSquares(daily.items, new Date().getFullYear())} />
        </div>
      </section>

      {kept.length > 0 && (
        <div className="mt-16">
          <Section title="Kept lines">
            <ul className="flex flex-col gap-6">
              {kept.map((k, i) => (
                <li key={i} className="quote">
                  <p className="font-serif text-xl italic leading-relaxed text-ink">{k.text}</p>
                  <time dateTime={k.date} className="mt-1 block text-xs text-ink-dim">
                    {dayLabel(k.date)}
                  </time>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <VaultWarnings warnings={warnings} />
    </main>
  );
}
