"use client";

import { useCallback, useEffect, useState } from "react";
import { useIsApp, useServer } from "@/lib/api";
import { feel } from "@/lib/feel/sounds";
import { readKept } from "@/lib/offline";
import type { Library, Session } from "@/lib/knowledge";
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

  const items = session ? [...session.items, ...(session.passage ? [session.passage] : [])] : [];
  const s = lib.stats;
  const facts = [
    `${s.known} of ${s.cards} cards known`,
    s.due ? `${s.due} due` : null,
    s.recall !== null ? `${Math.round(s.recall * 100)}% recalled (30 days)` : null,
    `${s.passagesWeek} passages this week`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      {offline && <p className="text-xs text-ink-dim">Offline: showing what this phone saw last. What you read is sent when the PC answers.</p>}
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

// "mind-and-learning" -> "Mind and learning"
const deckName = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
