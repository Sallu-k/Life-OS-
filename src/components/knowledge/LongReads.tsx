"use client";

import { useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { loadPassages, logEvent, makeCurrent, passageId, type Library, type Passage } from "@/lib/knowledge";

// Whole books read passage by passage. "Continue reading" opens a longer sitting (passage after passage,
// each one logged as you finish it); "Make current" picks the book the Gate shows before leisure.
export function LongReads({ books, onChange }: { books: Library["books"]; onChange(): void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pages, setPages] = useState<Passage[]>([]);
  const [error, setError] = useState("");

  async function read(slug: string) {
    try {
      setPages(await loadPassages(slug, 5));
      setOpen(slug);
      setError("");
      feel("open");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function finish(p: Passage) {
    logEvent({ kind: "passage", id: passageId(p) });
    feel("markDone");
    const rest = pages.slice(1);
    if (rest.length) setPages(rest);
    else setOpen(null); // five parts done: "Continue reading" fetches the next ones once the PC has them
    onChange();
  }

  async function current(slug: string) {
    await makeCurrent(slug).catch((e: Error) => setError(e.message));
    feel("select");
    onChange();
  }

  if (!books.length)
    return <p className="text-sm text-ink-dim">No long reads yet. Add one on the PC: npm run add-knowledge -- gutenberg 2680 (or epub &quot;book.epub&quot;).</p>;
  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-ink-dim">{error}</p>}
      {books.map((b) => (
        <div key={b.slug} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 className="text-ink">{b.title}</h3>
            {b.author && <span className="text-xs text-ink-dim">{b.author}</span>}
            {b.current && <span className="text-xs text-brass">on the Gate</span>}
          </div>
          <div className="progress-track" aria-label={`${b.position} of ${b.total} parts read`}>
            <div className="progress-fill" style={{ width: `${b.total ? (100 * b.position) / b.total : 0}%` }} />
          </div>
          <p className="text-xs text-ink-dim">
            {b.position} of {b.total} parts
          </p>
          {open === b.slug && pages[0] ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-ink-dim">
                Part {pages[0].index + 1} of {pages[0].total}
              </p>
              <p className="reading-text">{pages[0].text}</p>
              <div className="flex gap-2">
                <button type="button" className="chip edit-primary" onClick={() => finish(pages[0])}>
                  Next
                </button>
                <button type="button" className="chip" onClick={() => setOpen(null)}>
                  Stop here
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {b.position < b.total && (
                <button type="button" className="chip edit-primary" onClick={() => read(b.slug)}>
                  {b.position ? "Continue reading" : "Start reading"}
                </button>
              )}
              {!b.current && (
                <button type="button" className="chip" onClick={() => current(b.slug)}>
                  Make current
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
