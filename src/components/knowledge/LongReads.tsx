"use client";

import { useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { makeCurrent, resumeAt, type Library } from "@/lib/knowledge";

// Whole books and articles. "Read" opens the book reader (/read/) where you left off; "Make current"
// picks the book the Gate offers ("Continue my book") and the Knowledge page shows first.
export function LongReads({ books, onChange }: { books: Library["books"]; onChange(): void }) {
  const [error, setError] = useState("");

  async function current(slug: string) {
    await makeCurrent(slug).catch((e: Error) => setError(e.message));
    feel("select");
    onChange();
  }

  if (!books.length)
    return <p className="text-sm text-ink-dim">No long reads yet. Add one on the PC: npm run add-knowledge -- gutenberg 2680 (or epub, text, article).</p>;
  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-ink-dim">{error}</p>}
      {books.map((b) => {
        const at = resumeAt(b.slug, b.position);
        const percent = b.total ? Math.floor((100 * at) / b.total) : 0;
        const chapter = [...(b.chapters ?? [])].reverse().find((c) => c.index <= at);
        return (
          <div key={b.slug} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className="text-ink">{b.title}</h3>
              {b.author && <span className="text-xs text-ink-dim">{b.author}</span>}
              {b.current && <span className="text-xs text-brass">your book</span>}
            </div>
            <div className="progress-track" aria-label={`${percent}% read`}>
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-ink-dim">
              {chapter ? `${chapter.title} · ` : ""}
              {at >= b.total ? "Finished" : `${percent}%`}
            </p>
            <div className="flex gap-2">
              <a className="chip edit-primary" href={`/read/?book=${b.slug}`} onClick={() => feel("open")}>
                {at >= b.total ? "Read again" : at ? "Continue" : "Start reading"}
              </a>
              {!b.current && (
                <button type="button" className="chip" onClick={() => current(b.slug)}>
                  Make current
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
