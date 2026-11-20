"use client";

import { useRouter } from "next/navigation";
import { assetUrl } from "@/lib/vault/assets";
import { genreGroups } from "@/lib/vault/gameGenres";
import type { Game } from "@/lib/vault/types";
import { GameWall } from "./GameWall";
import { SceneShell, type SceneCallbacks } from "./SceneShell";

// The Games page body: a 3D neon arcade with one cabinet per main genre (when this computer can show it),
// or the classic poster wall. Clicking a cabinet opens the poster wall for that genre.
export function GamesExperience({ games }: { games: Game[] }) {
  const router = useRouter();
  const groups = genreGroups(games);
  const gamesOf = (name: string) => groups.find((g) => g.name === name)?.games ?? [];

  async function start(callbacks: SceneCallbacks) {
    const { createNeonArcade } = await import("@/lib/three/neonArcade");
    return createNeonArcade({
      ...callbacks,
      groups: groups.map((g) => ({
        name: g.name,
        games: g.games.map((game) => ({ slug: game.slug, title: game.title, platform: game.platform, poster: assetUrl(game.poster) })),
      })),
      onOpenGame: (slug) => router.push(`/games/${slug}/`),
    });
  }

  return (
    <SceneShell
      storageKey="lifeos-games-mode"
      sceneLabel="Arcade"
      label="Neon arcade: pick a cabinet"
      hint="Drag to turn the room · scroll to zoom · click a cabinet"
      groups={groups.map((g) => g.name)}
      start={start}
      classic={<GameWall games={games} />}
      panelTitle={(name) => (
        <>
          {name} <span className="text-sm text-ink-dim">{gamesOf(name).length}</span>
        </>
      )}
      panel={(name) => <GameWall key={name} games={gamesOf(name)} />}
    />
  );
}
