import { loadBooks } from "./books";
import { loadGames } from "./games";
import type { Book, Game } from "./types";

// Small lookups for detail pages. Loaders are cached during a build, so this stays fast.
export function getBook(slug: string): Book | null {
  return loadBooks().items.find((b) => b.slug === slug) ?? null;
}

export function getGame(slug: string): Game | null {
  return loadGames().items.find((g) => g.slug === slug) ?? null;
}

// A static export must produce at least one page per route. With an empty collection
// (a brand-new vault), we produce one placeholder that renders "not found".
export const EMPTY_SLUG = "_none";
export function staticSlugs(slugs: string[]): { slug: string }[] {
  return (slugs.length > 0 ? slugs : [EMPTY_SLUG]).map((slug) => ({ slug }));
}
