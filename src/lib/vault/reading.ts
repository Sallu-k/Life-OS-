import type { Book, DailyRecord } from "./types";

// Reading pace and projections for the Library page, from the books and the daily `pages_read`.
export interface ReadingNow {
  slug: string;
  title: string;
  progress: number;
  pages: number | null;
  left: number | null;
  finishBy: string | null; // YYYY-MM-DD at the current pace
}
export interface ReadingStats {
  year: number;
  finishedThisYear: number;
  goal: number | null;
  expectedByNow: number | null; // where the goal says you should be today
  pace: number | null; // pages a day over the last 30 days (null: no pages logged)
  pagesThisMonth: number;
  now: ReadingNow[];
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function readingStats(books: Book[], records: DailyRecord[], goal: number | null, today = new Date()): ReadingStats {
  const year = today.getFullYear();
  const finishedThisYear = books.filter((b) => b.status === "finished" && b.finished?.startsWith(String(year))).length;
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  const from = ymd(start);
  const to = ymd(today);
  const recent = records.filter((r) => r.date >= from && r.date <= to && r.pages !== null);
  const pace = recent.length ? recent.reduce((s, r) => s + (r.pages ?? 0), 0) / 30 : null;
  const month = to.slice(0, 7);
  const pagesThisMonth = records.filter((r) => r.date.startsWith(month)).reduce((s, r) => s + (r.pages ?? 0), 0);
  const dayOfYear = Math.floor((today.getTime() - new Date(year, 0, 1).getTime()) / 864e5) + 1;
  const now = books
    .filter((b) => b.status === "reading")
    .map((b) => {
      const progress = b.progress ?? 0;
      const left = b.pages ? Math.max(0, b.pages - progress) : null;
      let finishBy: string | null = null;
      if (left !== null && pace && pace > 0) {
        const d = new Date(today);
        d.setDate(d.getDate() + Math.ceil(left / pace));
        finishBy = ymd(d);
      }
      return { slug: b.slug, title: b.title, progress, pages: b.pages, left, finishBy };
    });
  return {
    year,
    finishedThisYear,
    goal,
    expectedByNow: goal ? Math.floor((goal * dayOfYear) / 365) : null,
    pace,
    pagesThisMonth,
    now,
  };
}
