"use client";

import { useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { saveQuote } from "@/lib/knowledge";

// "Save a line": a sentence from the book you are reading goes to that book's Quotes, and comes back
// later as a card to read again. Needs the PC (a quote is written into the book's note).
export function SaveLine({ books }: { books: { slug: string; title: string }[] }) {
  const [book, setBook] = useState(books[0]?.slug ?? "");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  if (!books.length) return null;

  async function save() {
    const line = text.trim();
    if (!line || !book) return;
    try {
      await saveQuote(book, line);
      feel("saved");
      setText("");
      setMsg("Saved to the book's quotes.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="edit-field">
        <span>Save a line from</span>
        <select className="today-input" value={book} onChange={(e) => setBook(e.target.value)}>
          {books.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      <textarea className="today-input min-h-16" value={text} onChange={(e) => setText(e.target.value)} placeholder="A line worth keeping…" aria-label="Line to save" />
      <div className="flex items-center gap-3">
        <button type="button" className="chip edit-primary" onClick={save} disabled={!text.trim()}>
          Save line
        </button>
        {msg && <span className="text-xs text-ink-dim">{msg}</span>}
      </div>
    </div>
  );
}
