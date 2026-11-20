import { existingAsset, once, readFolder } from "./read";
import type { Game, GameStatus, LoadResult } from "./types";
import { nonNegNumber, optDate, oneOf, optString, rating, reqString, section, textList, year, yearMonth } from "./validate";

const STATUSES = ["playing", "finished", "unfinished", "dropped"] as const;

// Reads every note in Collections/Games and returns valid games plus readable warnings.
// A note with a broken REQUIRED field (title, platform, status) is skipped; other problems only warn.
export function loadGames(): LoadResult<Game> {
  return once("games", readGames);
}

function readGames(): LoadResult<Game> {
  const warnings: string[] = [];
  const games: Game[] = [];
  for (const { rel, slug, data, body } of readFolder("Collections/Games", "game", warnings)) {
    const required: string[] = [];
    const optional: string[] = [];
    const title = reqString(data, "title", required);
    const platform = reqString(data, "platform", required);
    const status = oneOf<GameStatus>(data, "status", STATUSES, required);
    if (required.length > 0 || status === null) {
      warnings.push(`${rel}: skipped. ${required.join("; ")}`);
      continue;
    }

    games.push({
      slug,
      title,
      platform,
      status,
      rating: rating(data, optional),
      finished: yearMonth(data, "finished", optional),
      started: optDate(data, "started", optional),
      progress: nonNegNumber(data, "progress", optional),
      opinion: optString(data, "opinion", optional),
      poster: existingAsset(data, "poster", optional),
      backdrop: existingAsset(data, "backdrop", optional),
      released: year(data, "released", optional),
      developer: optString(data, "developer", optional),
      publisher: optString(data, "publisher", optional),
      genres: textList(data, "genres", optional),
      series: optString(data, "series", optional),
      note: optString(data, "note", optional),
      moment: optString(data, "moment", optional) ?? firstLine(section(body, "The moment that stayed")),
      hours: nonNegNumber(data, "hours", optional),
      verdict: section(body, "Verdict"),
    });
    for (const p of optional) warnings.push(`${rel}: ${p}`);
  }

  games.sort(compareGames);
  return { items: games, warnings };
}

function firstLine(text: string | null): string | null {
  if (!text) return null;
  return text.split(/\r?\n/).find((l) => l.trim() !== "")?.trim() ?? null;
}

// Playing first, then finished, then unfinished/dropped.
// Within a group: most recently finished, then newest release, then title.
function compareGames(a: Game, b: Game): number {
  const rank = { playing: 0, finished: 1, unfinished: 2, dropped: 2 } as const;
  if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
  const fa = a.finished ?? "";
  const fb = b.finished ?? "";
  if (fa !== fb) return fb.localeCompare(fa);
  if (a.released !== b.released) return (b.released ?? 0) - (a.released ?? 0);
  return a.title.localeCompare(b.title);
}
