import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { loadDaily } from "@/lib/vault/daily";
import { loadHabitDefinitions } from "@/lib/vault/habits";
import { findInsights } from "@/lib/vault/insights";
import { gateFindings, loadGate } from "@/lib/vault/gate";
import { knowledgeFindings } from "@/lib/vault/knowledge";
import { loadSettings } from "@/lib/vault/settings";

export const metadata: Metadata = { title: "Insights" };

const TONE = { good: "insight-good", care: "insight-care", neutral: "" } as const;

// Patterns from the daily record (habits, productivity, screen time, sleep, mood, reasons). Worked out
// when the site is built; only numbers and habit marks are used, never journal text.
export default function InsightsPage() {
  const habits = loadHabitDefinitions().items;
  const records = loadDaily(habits).items;
  const today = new Date().toISOString().slice(0, 10);
  const findings = [...findInsights(records, habits, loadSettings().sleepBy), ...gateFindings(loadGate(), records, today), ...knowledgeFindings(today)];
  const withMood = records.filter((r) => r.mood !== null).length;
  const withSleep = records.filter((r) => r.sleep !== null).length;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Patterns" title="Insights" stats={[`${records.length} days looked at`, "patterns, not proof"]} />

      {findings.length === 0 ? (
        <p className="card p-5 text-sm text-ink-dim">Not enough days yet to see patterns. Keep logging; findings appear once each side of a comparison has at least 8 days.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {findings.map((f, i) => (
            <li key={i} className={`card insight ${TONE[f.tone]}`}>
              <p className="font-serif text-lg text-ink">{f.title}</p>
              <p className="text-sm text-ink-dim">{f.detail}</p>
              <p className="text-xs text-ink-dim">Based on {f.days} days</p>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 flex flex-col gap-2 text-sm text-ink-dim">
        <h2 className="ornament font-serif text-xl text-ink">How to read this</h2>
        <p>
          Each finding compares days with something and days without it, and only shows when both sides have enough days. Things that happen together are not always cause and effect: use these as questions to try, not rules.
        </p>
        <p>
          Mood logged on {withMood} days, sleep on {withSleep}. Log both on <Link href="/today/" className="text-brass hover:underline">Today</Link> and tap a reason when a habit is not done; new kinds of findings appear as those build up.
        </p>
      </section>
    </main>
  );
}
