"use client";

import { Fold } from "./Fold";
import { useState } from "react";
import { FUN_KINDS, formatFun, funLabel, parseFun, type FunKind } from "@/lib/fun";
import { feel } from "@/lib/feel/sounds";

const GROUPS = ["Gaming", "Media", "Other"] as const;
type Group = (typeof GROUPS)[number];
const ICON: Record<FunKind, string> = { story: "🎮", competitive: "🎮", series: "📺", movie: "🎬", other: "✨" };

// Today's fun: pick Gaming (Story / Competitive), Media (Series / Movie) or Other, name it, add.
// Saved at once to the day's "## Fun" section (works offline like the rest of Today).
export function FunList({ items, readOnly = false, onChange }: { items: string[]; readOnly?: boolean; onChange(items: string[]): void }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [kind, setKind] = useState<FunKind | null>(null);
  const [text, setText] = useState("");
  const kinds = FUN_KINDS.filter((k) => k.group === group);

  function pickGroup(g: Group) {
    feel("select");
    setGroup(g);
    setKind(g === "Other" ? "other" : null);
  }
  function add() {
    if (!kind) return;
    onChange([...items, formatFun(kind, text)]);
    setText("");
    setGroup(null);
    setKind(null);
  }

  return (
    <Fold id="fun" title="Fun" summary={items.length ? `${items.length} today` : "Games, shows, films, outings"}>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((line, i) => (
            <li key={`${i}-${line}`} className="feel-enter flex items-center gap-2 text-sm text-ink">
              <span aria-hidden="true">{ICON[parseFun(line).kind.id]}</span>
              <span className="flex-1">{funLabel(line)}</span>
              <button type="button" className="text-ink-dim hover:text-ink" disabled={readOnly} aria-label={`Remove ${funLabel(line)}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
      <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of fun">
        {GROUPS.map((g) => (
          <button key={g} type="button" className={`chip ${group === g ? "edit-primary" : ""}`} aria-pressed={group === g} onClick={() => pickGroup(g)}>
            {g}
          </button>
        ))}
      </div>
      )}
      {!readOnly && group && group !== "Other" && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${group}: which kind`}>
          {kinds.map((k) => (
            <button key={k.id} type="button" className={`chip ${kind === k.id ? "edit-primary" : ""}`} aria-pressed={kind === k.id} onClick={() => (feel("select"), setKind(k.id))}>
              {k.label}
            </button>
          ))}
        </div>
      )}
      {!readOnly && kind && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            autoFocus
            className="today-input flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === "movie" ? "Which film?" : kind === "series" ? "Which series?" : kind === "other" ? "What was it?" : "Which game?"}
            aria-label="Name"
          />
          <button type="submit" className="chip edit-primary">
            Add
          </button>
        </form>
      )}
    </Fold>
  );
}
