import type { Metadata } from "next";
import { GamesExperience } from "@/components/GamesExperience";
import { PageHeader } from "@/components/PageHeader";
import { VaultWarnings } from "@/components/VaultWarnings";
import { plural } from "@/lib/format";
import { SectionTools } from "@/components/edit/EditTools";
import { loadGames } from "@/lib/vault/games";

export const metadata: Metadata = { title: "Games" };

export default function GamesPage() {
  const { items: games, warnings } = loadGames();
  const count = (...s: string[]) => games.filter((g) => s.includes(g.status)).length;
  const stats = [plural(games.length, "game"), `${count("finished")} finished`, `${count("playing")} playing`, `${count("unfinished", "dropped")} unfinished`];

  return (
    <main data-theme="arcade" className="mx-auto w-full max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Collection" title="Games" stats={stats} />
      <SectionTools collection="games" />

      {games.length === 0 ? (
        <p className="text-ink-dim">No games yet. Add a note in Collections/Games in your vault.</p>
      ) : (
        <GamesExperience games={games} />
      )}

      <VaultWarnings warnings={warnings} />
    </main>
  );
}
