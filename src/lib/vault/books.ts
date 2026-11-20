import { existingAsset, once, readFolder } from "./read";
import type { Book, BookStatus, LoadResult } from "./types";
import { bool, nonNegNumber, optDate, optString, rating, reqString, section, year, yearMonth, type Data } from "./validate";

const STATUSES = ["unread", "reading", "finished"] as const;

// Reads every note in Collections/Books and returns valid books plus readable warnings.
// Only the title is required; a note without one is skipped. Other problems only warn.
export function loadBooks(): LoadResult<Book> {
  return once("books", readBooks);
}

function readBooks(): LoadResult<Book> {
  const warnings: string[] = [];
  const books: Book[] = [];
  for (const { rel, slug, data, body } of readFolder("Collections/Books", "book", warnings)) {
    const required: string[] = [];
    const optional: string[] = [];
    const title = reqString(data, "title", required);
    if (required.length > 0) {
      warnings.push(`${rel}: skipped. ${required.join("; ")}`);
      continue;
    }

    const status = readStatus(data, optional);
    const stars = rating(data, optional);

    books.push({
      slug,
      title,
      author: optString(data, "author", optional),
      status,
      rating: stars,
      finished: yearMonth(data, "finished", optional),
      started: optDate(data, "started", optional),
      progress: nonNegNumber(data, "progress", optional),
      opinion: optString(data, "opinion", optional),
      isbn: optString(data, "isbn", optional),
      cover: existingAsset(data, "cover", optional),
      special: bool(data, "special", optional),
      category: optString(data, "category", optional),
      published: year(data, "published", optional),
      pages: nonNegNumber(data, "pages", optional),
      note: optString(data, "note", optional),
      verdict: section(body, "Verdict"),
      quotes: section(body, "Quotes"),
      copyStory: section(body, "Story of this copy"),
    });
    for (const p of optional) warnings.push(`${rel}: ${p}`);
  }

  books.sort(compareBooks);
  return { items: books, warnings };
}

// An empty status means the book is simply on the shelf. An unknown status warns and is treated the same.
function readStatus(d: Data, problems: string[]): BookStatus {
  const v = d.status;
  if (v === null || v === undefined || v === "") return "shelf";
  if (typeof v === "string" && (STATUSES as readonly string[]).includes(v)) return v as BookStatus;
  problems.push(`status: must be empty or one of ${STATUSES.join(", ")}; treated as empty`);
  return "shelf";
}

// Reading first, then finished (newest first), then to-read, then the rest of the shelf.
// Within a group: category, then title.
function compareBooks(a: Book, b: Book): number {
  const rank = { reading: 0, finished: 1, unread: 2, shelf: 3 } as const;
  if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
  if (a.status === "finished") {
    const fa = a.finished ?? "";
    const fb = b.finished ?? "";
    if (fa !== fb) return fb.localeCompare(fa);
  }
  const ca = a.category ?? "";
  const cb = b.category ?? "";
  if (ca !== cb) return ca.localeCompare(cb);
  return a.title.localeCompare(b.title);
}
