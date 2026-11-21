"use client";

import { useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { logEvent, passageId, type Card, type Passage } from "@/lib/knowledge";
import { Prose } from "./Prose";

// One thing at a time: a card to read, a question to recall (answer hidden until you ask), or a passage.
// Recall beats re-reading, so a due card with a question is asked, not shown.
export function ReviewFlow({ items, onDone }: { items: (Card | Passage)[]; onDone(): void }) {
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const item = items[at];
  if (!item) return null;

  function next(e: Parameters<typeof logEvent>[0] | null) {
    if (e) logEvent(e);
    feel("markDone");
    setShown(false);
    if (at + 1 >= items.length) onDone();
    else setAt(at + 1);
  }

  const step = (
    <span className="text-xs text-ink-dim">
      {at + 1} of {items.length}
    </span>
  );

  if (item.type === "passage")
    return (
      <div className="flex flex-col gap-3">
        {step}
        <p className="text-sm text-ink-dim">
          {item.title} · part {item.index + 1} of {item.total}
        </p>
        <div className="reading-text">
          <Prose text={item.text} />
        </div>
        <button type="button" className="chip edit-primary self-start" onClick={() => next({ kind: "passage", id: passageId(item) })}>
          Done reading
        </button>
      </div>
    );

  if (item.type === "recall" && item.q)
    return (
      <div className="flex flex-col gap-3">
        {step}
        <p className="text-xs text-ink-dim">Do you remember?</p>
        <p className="text-lg text-ink">{item.q}</p>
        {!shown ? (
          <button type="button" className="chip edit-primary self-start" onClick={() => setShown(true)}>
            Show answer
          </button>
        ) : (
          <>
            <p className="text-ink">{item.a}</p>
            <p className="text-sm text-ink-dim">{item.text}</p>
            <div className="flex gap-2">
              <button type="button" className="chip edit-primary" onClick={() => next({ kind: "knew", id: item.id })}>
                Knew it
              </button>
              <button type="button" className="chip" onClick={() => next({ kind: "notyet", id: item.id })}>
                Not yet
              </button>
            </div>
          </>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {step}
      <h3 className="text-lg text-ink">{item.title}</h3>
      <p className="reading-text">{item.text}</p>
      {item.source && <p className="text-xs text-ink-dim">{item.source}</p>}
      <button type="button" className="chip edit-primary self-start" onClick={() => next({ kind: "read", id: item.id })}>
        Done
      </button>
    </div>
  );
}
