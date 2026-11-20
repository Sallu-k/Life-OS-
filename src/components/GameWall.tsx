"use client";

import { useState } from "react";
import { plural } from "@/lib/format";
import type { Game } from "@/lib/vault/types";
import { Chip } from "./Chip";
import { GameTile } from "./GameTile";

type Filter = "all" | "finished" | "playing" | "unfinished";
type Sort = "default" | "newest" | "oldest" | "title";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "finished", label: "Finished" },
  { value: "playing", label: "Playing" },
  { value: "unfinished", label: "Unfinished" },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: "default", label: "Playing first" },
  { value: "newest", label: "Newest release" },
  { value: "oldest", label: "Oldest release" },
  { value: "title", label: "A–Z" },
];

function matches(game: Game, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "unfinished") return game.status === "unfinished" || game.status === "dropped";
  return game.status === filter;
}

// Games arrive already in the default order (playing, finished, unfinished).
function sorted(games: Game[], sort: Sort): Game[] {
  if (sort === "default") return games;
  const list = [...games];
  if (sort === "title") return list.sort((a, b) => a.title.localeCompare(b.title));
  const dir = sort === "newest" ? -1 : 1;
  return list.sort((a, b) => dir * ((a.released ?? 0) - (b.released ?? 0)) || a.title.localeCompare(b.title));
}

// The poster wall with a status filter and a sort order.
export function GameWall({ games }: { games: Game[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("default");
  const shown = sorted(games.filter((g) => matches(g, filter)), sort);
  const usedFilters = FILTERS.filter((f) => f.value === "all" || games.some((g) => matches(g, f.value)));

  return (
    <>
      <div className="mb-10 flex flex-col gap-3 border-y border-ink-dim/10 py-4 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {usedFilters.map((f) => (
            <Chip key={f.value} pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <span className="hidden h-5 w-px bg-ink-dim/20 lg:block" aria-hidden="true" />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sort">
          {SORTS.map((s) => (
            <Chip key={s.value} pressed={sort === s.value} onClick={() => setSort(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Showing {shown.length} of {plural(games.length, "game")}
      </p>

      <section aria-label="Game poster wall" className="poster-grid grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {shown.map((game) => (
          <GameTile key={game.slug} game={game} />
        ))}
      </section>
    </>
  );
}
