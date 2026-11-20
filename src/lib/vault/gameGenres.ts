import type { Game } from "./types";

export const MORE_GENRES = "More genres";

// A game's main genre is the first one in its note.
export const mainGenre = (game: Game): string => game.genres[0] ?? MORE_GENRES;

// The arcade groups games by main genre. A genre with only one game goes into "More genres",
// so the room is not full of one-game cabinets. Largest groups first; "More genres" last.
export function genreGroups(games: Game[]): { name: string; games: Game[] }[] {
  const byGenre = new Map<string, Game[]>();
  for (const game of games) byGenre.set(mainGenre(game), [...(byGenre.get(mainGenre(game)) ?? []), game]);

  const groups: { name: string; games: Game[] }[] = [];
  const more: Game[] = byGenre.get(MORE_GENRES) ?? [];
  for (const [name, list] of byGenre) {
    if (name === MORE_GENRES) continue;
    if (list.length >= 2) groups.push({ name, games: list });
    else more.push(...list);
  }
  groups.sort((a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name));
  if (more.length > 0) groups.push({ name: MORE_GENRES, games: more });
  return groups;
}
