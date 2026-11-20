"use client";

import { useEffect, useState } from "react";
import { plural, UNSORTED_SHELF } from "@/lib/format";
import type { Book, BookStatus } from "@/lib/vault/types";
import { BookTile } from "./BookTile";
import { Chip } from "./Chip";

const STATUS_OPTIONS: { value: BookStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reading", label: "Reading" },
  { value: "finished", label: "Finished" },
  { value: "unread", label: "To read" },
];
const RATING_OPTIONS = [0, 3, 4, 5]; // 0 = any rating
const VIEW_KEY = "lifeos-library-view";

// Lower-case, accents, apostrophes and hyphens removed, so "cafe" finds "Café" and "dont" finds "Don't".
function plain(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’ʼ`\-]/g, "")
    .toLowerCase();
}

const shelfOf = (b: Book) => b.category ?? UNSORTED_SHELF;

// The book cover wall with search, shelf, status and rating filters, and a Flat/3D switch.
// With no filter or search, books are shown shelf by shelf (in `shelves` order).
// Status and rating filters only appear once some book uses them.
export function LibraryWall({ books, shelves }: { books: Book[]; shelves: string[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<BookStatus | "all">("all");
  const [minRating, setMinRating] = useState(0);
  const [view, setView] = useState<"flat" | "3d">("flat");
  const [can3d, setCan3d] = useState(false);

  // 3D only with a mouse and when motion is welcome; otherwise always flat.
  useEffect(() => {
    const ok = !matchMedia("(prefers-reduced-motion: reduce)").matches && matchMedia("(hover: hover)").matches;
    setCan3d(ok);
    try {
      // 3D is the default; a saved "flat" choice wins.
      if (ok && localStorage.getItem(VIEW_KEY) !== "flat") setView("3d");
    } catch {
      if (ok) setView("3d"); // Storage blocked: still use the default.
    }
  }, []);

  function chooseView(next: "flat" | "3d") {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this visit only.
    }
  }

  // A rating filter only makes sense for finished books, so picking one switches to "Finished".
  function chooseRating(r: number) {
    setMinRating(r);
    if (r > 0 && status !== "finished" && status !== "all") setStatus("finished");
  }
  function chooseStatus(s: BookStatus | "all") {
    setStatus(s);
    if (s !== "finished" && s !== "all") setMinRating(0);
  }

  const statuses = STATUS_OPTIONS.filter((o) => o.value === "all" || books.some((b) => b.status === o.value));
  const hasRatings = books.some((b) => b.rating !== null);
  const q = plain(query.trim());

  const shown = books.filter(
    (b) =>
      (category === "all" || shelfOf(b) === category) &&
      (status === "all" || b.status === status) &&
      (minRating === 0 || (b.rating ?? 0) >= minRating) &&
      (q === "" || plain(`${b.title} ${b.author ?? ""} ${shelfOf(b)}`).includes(q)),
  );

  // Shelf by shelf only when nothing narrows the list (otherwise one grid of results).
  const bySection = shelves.length > 1 && category === "all" && status === "all" && minRating === 0 && q === "";
  const depth = can3d && view === "3d";

  return (
    <>
      <div className="mb-10 flex flex-col gap-4 border-y border-ink-dim/10 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-1 items-center gap-2 rounded-full border border-ink-dim/25 bg-surface/60 px-4 py-1.5 focus-within:border-brass/60">
            <span className="text-ink-dim" aria-hidden="true">⌕</span>
            <span className="sr-only">Search books by title or author</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or author"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-dim focus:outline-none"
            />
          </label>
          {can3d && (
            <div className="flex gap-2" role="group" aria-label="Book view">
              <Chip pressed={view === "flat"} onClick={() => chooseView("flat")}>
                Flat
              </Chip>
              <Chip pressed={view === "3d"} onClick={() => chooseView("3d")}>
                3D
              </Chip>
            </div>
          )}
        </div>

        {shelves.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by shelf">
            <Chip pressed={category === "all"} onClick={() => setCategory("all")}>
              All shelves
            </Chip>
            {shelves.map((c) => (
              <Chip key={c} pressed={category === c} onClick={() => setCategory(c)}>
                {c}
              </Chip>
            ))}
          </div>
        )}

        {(statuses.length > 1 || hasRatings) && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
            {statuses.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
                {statuses.map((o) => (
                  <Chip key={o.value} pressed={status === o.value} onClick={() => chooseStatus(o.value)}>
                    {o.label}
                  </Chip>
                ))}
              </div>
            )}
            {hasRatings && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by rating">
                {RATING_OPTIONS.map((r) => (
                  <Chip key={r} pressed={minRating === r} onClick={() => chooseRating(r)}>
                    {r === 0 ? "Any rating" : r === 5 ? "★ 5 only" : `★ ${r}+`}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        Showing {shown.length} of {plural(books.length, "book")}
      </p>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-ink-dim">No books match{q ? ` “${query.trim()}”` : " these filters"}.</p>
      ) : bySection ? (
        <div className="flex flex-col gap-16">
          {shelves.map((shelf) => {
            const list = shown.filter((b) => shelfOf(b) === shelf);
            if (list.length === 0) return null;
            const id = `shelf-${shelf.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <section key={shelf} aria-labelledby={id} className="flex flex-col gap-7">
                <h2 id={id} className="ornament font-serif text-2xl text-ink">
                  {shelf}
                  <span className="text-sm text-ink-dim">{list.length}</span>
                </h2>
                <BookGrid books={list} depth={depth} />
              </section>
            );
          })}
        </div>
      ) : (
        <BookGrid books={shown} depth={depth} label="Book cover wall" />
      )}
    </>
  );
}

function BookGrid({ books, depth, label }: { books: Book[]; depth: boolean; label?: string }) {
  return (
    <div role={label ? "region" : undefined} aria-label={label} className="book-grid grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {books.map((book) => (
        <BookTile key={book.slug} book={book} depth={depth} />
      ))}
    </div>
  );
}
