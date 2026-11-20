// Small display helpers. No Node imports, so browser components can use them too.

// "2026-03" -> "March 2026"
export function monthLabel(ym: string | null): string | null {
  if (!ym) return null;
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// "2026-01-20" -> "20 January 2026" (or "20 Jan 2026" when short)
export function dayLabel(ymd: string, short = false): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-GB", {
    day: "numeric",
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// How each game status is shown. "dropped" (older notes) reads the same as "unfinished".
export const GAME_STATUS_LABEL = { playing: "Playing", finished: "Finished", unfinished: "Unfinished", dropped: "Unfinished" } as const;

// The shelf for books without a category.
export const UNSORTED_SHELF = "Unsorted";

// "1 book", "2 books"
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
