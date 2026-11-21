"use client";

import { useCallback, useEffect, useState } from "react";
import { useIsApp, useServer } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";
import { readKept } from "@/lib/offline";
import { logEvent, resumeAt, type Card, type Library, type Session } from "@/lib/knowledge";
import { Fold } from "@/components/today/Fold";
import { LongReads } from "./LongReads";
import { ReviewFlow } from "./ReviewFlow";
import { SaveLine } from "./SaveLine";

// The Knowledge page: today's review (due recall questions, new cards and the next passage), long reads,
// "Save a line", and every deck. Live through the LifeOS server, like Plan; the phone keeps the last copy.
export function KnowledgeApp() {
  const server = useServer();
  const app = useIsApp();
  const [lib, setLib] = useState<Library | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    readKept<Library>("knowledge/library").then(
      (r) => (setLib(r.data), setOffline(r.saved)),
      (e: Error) => setError(e.message),
    );
    readKept<Session>("knowledge/session?n=5").then((r) => setSession(r.data), () => undefined);
  }, []);
  useEffect(() => {
    if (server || app) load();
  }, [server, app, load]);

  if (!app && server === null) return <p className="text-ink-dim">Connecting…</p>;
  if (!app && server === false)
    return <p className="card p-5 text-sm text-ink-dim">Knowledge works through the LifeOS server. On the PC run npm start and open the address it prints.</p>;
  if (!lib) return <p className="text-ink-dim">{error || "Loading…"}</p>;

  // Books are read in the reader now (/read/), so the review is cards only.
  const items = session ? session.items : [];
  const s = lib.stats;
  const book = lib.books.find((b) => b.current) ?? lib.books.find((b) => b.position < b.total) ?? null;
  const facts = [
    `${s.known} of ${s.cards} cards known`,
    s.due ? `${s.due} due` : null,
    s.recall !== null ? `${Math.round(s.recall * 100)}% recalled (30 days)` : null,
    `${s.passagesWeek} passages this week`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      {offline && <p className="text-xs text-ink-dim">Offline: showing what this phone saw last. What you read is sent when the PC answers.</p>}
      <Fact cards={items} onDone={() => setTimeout(load, 600)} />
      {book && <ContinueBook book={book} />}
      <section className="card flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="font-serif text-xl text-ink">Today&apos;s review</h2>
        <p className="text-sm text-ink-dim">{facts.join(" · ")}</p>
        {reviewing ? (
          <ReviewFlow items={items} onDone={() => (setReviewing(false), feel("allDone"), setTimeout(load, 600))} />
        ) : items.length ? (
          <button type="button" className="chip edit-primary self-start" onClick={() => (feel("open"), setReviewing(true))}>
            Start ({items.length})
          </button>
        ) : (
          <p className="text-sm text-ink-dim">Nothing waiting. Add cards in the vault&apos;s Knowledge/Cards folder.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card flex flex-col gap-3 p-4 sm:p-5">
          <h2 className="font-serif text-xl text-ink">Long reads</h2>
          <LongReads books={lib.books} onChange={() => setTimeout(load, 600)} />
        </section>
        {lib.reading && lib.reading.length > 0 && (
          <section className="card flex flex-col gap-3 p-4 sm:p-5">
            <h2 className="font-serif text-xl text-ink">Save a line</h2>
            <SaveLine books={lib.reading} />
          </section>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {lib.decks.map((d) => (
          <Fold key={d.deck} id={`deck-${d.deck}`} title={deckName(d.deck)} summary={`${d.known} of ${d.count} known${d.due ? ` · ${d.due} due` : ""}`}>
            {d.cards.map((c) => (
              <div key={c.id} className="flex flex-col gap-1 border-t border-white/5 pt-3 first:border-0 first:pt-0">
                <h3 className="text-ink">{c.title}</h3>
                <p className="text-sm text-ink-dim">{c.text}</p>
                {c.source && <p className="text-xs text-ink-dim opacity-70">{c.source}</p>}
              </div>
            ))}
          </Fold>
        ))}
      </div>
    </div>
  );
}

// The page opens on one fact: read it ("Got it" logs it, so spacing brings it back later) or see another.
function Fact({ cards, onDone }: { cards: Card[]; onDone(): void }) {
  const [at, setAt] = useState(0);
  const facts = cards.filter((c) => c.type === "card");
  const c = facts[at % Math.max(1, facts.length)];
  if (!c) return null;
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-label="A fact">
      <p className="text-xs text-ink-dim">A fact · {deckName(c.deck)}</p>
      <h2 className="font-serif text-xl text-ink">{c.title}</h2>
      <p className="reading-text">{c.text}</p>
      {c.source && <p className="text-xs text-ink-dim opacity-70">{c.source}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip edit-primary" onClick={() => (logEvent({ kind: "read", id: c.id }), feel("markDone"), setAt(at + 1), onDone())}>
          Got it
        </button>
        {facts.length > 1 && (
          <button type="button" className="chip" onClick={() => (feel("select"), setAt(at + 1))}>
            Another fact
          </button>
        )}
      </div>
    </section>
  );
}

// The book you are reading: where you are, and the way into the reader.
function ContinueBook({ book }: { book: Library["books"][number] }) {
  const at = resumeAt(book.slug, book.position);
  const chapter = [...(book.chapters ?? [])].reverse().find((c) => c.index <= at);
  const percent = book.total ? Math.floor((100 * at) / book.total) : 0;
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-label="Continue reading">
      <p className="text-xs text-ink-dim">Your book</p>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-serif text-xl text-ink">{book.title}</h2>
        {book.author && <span className="text-sm text-ink-dim">{book.author}</span>}
      </div>
      <div className="progress-track" aria-label={`${percent}% read`}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-ink-dim">
        {chapter ? `${chapter.title} · ` : ""}
        {percent}% read
      </p>
      <a className="chip edit-primary self-start" href={`/read/?book=${book.slug}`} onClick={() => feel("open")}>
        {at ? "Continue reading" : "Start reading"}
      </a>
    </section>
  );
}

// "mind-and-learning" -> "Mind and learning"
const deckName = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
