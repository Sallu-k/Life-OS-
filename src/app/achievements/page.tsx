import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { VaultWarnings } from "@/components/VaultWarnings";
import { dayLabel, plural } from "@/lib/format";
import { loadAchievements } from "@/lib/vault/achievements";
import { assetUrl } from "@/lib/vault/assets";
import { SectionTools } from "@/components/edit/EditTools";
import type { Achievement } from "@/lib/vault/types";

export const metadata: Metadata = { title: "Achievements" };

// Groups achievements by year, newest year first (items are already sorted newest first).
function byYear(items: Achievement[]): [string, Achievement[]][] {
  const groups = new Map<string, Achievement[]>();
  for (const a of items) {
    const year = a.date.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), a]);
  }
  return [...groups.entries()];
}

export default function AchievementsPage() {
  const { items, warnings } = loadAchievements();

  return (
    <main data-theme="trophy" className="mx-auto w-full max-w-4xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Milestones" title="Achievements" stats={[plural(items.length, "moment") + " worth keeping"]} />
      <SectionTools collection="achievements" />

      {items.length === 0 && <p className="text-ink-dim">No achievements yet. Add a note in Collections/Achievements in your vault.</p>}

      {byYear(items).map(([year, list]) => (
        <section key={year} aria-labelledby={`year-${year}`} className="mb-14">
          <h2 id={`year-${year}`} className="ornament mb-8 font-serif text-3xl text-brass">
            {year}
          </h2>
          <ol className="relative flex flex-col gap-6 pl-8 before:absolute before:bottom-2 before:left-[0.45rem] before:top-2 before:w-px before:bg-gradient-to-b before:from-brass/50 before:to-transparent">
            {list.map((a) => {
              const img = assetUrl(a.image);
              return (
                <li key={a.slug} className="relative">
                  <span
                    className="absolute -left-8 top-5 h-[0.95rem] w-[0.95rem] rounded-full border-2 border-brass bg-bg shadow-[0_0_12px_var(--brass)]"
                    aria-hidden="true"
                  />
                  <article className="card flex flex-col gap-2 p-5">
                    <time dateTime={a.date} className="text-xs uppercase tracking-[0.18em] text-ink-dim">
                      {dayLabel(a.date)}
                    </time>
                    <h3 className="font-serif text-xl text-ink">{a.title}</h3>
                    {a.why && <p className="leading-relaxed text-ink-dim">{a.why}</p>}
                    {img && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={a.title} loading="lazy" className="mt-2 max-h-72 w-fit rounded-md border border-ink-dim/20" />
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <VaultWarnings warnings={warnings} />
    </main>
  );
}
