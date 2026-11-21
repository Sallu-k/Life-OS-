"use client";

import { useEffect, useState } from "react";
import { dayLabel } from "@/lib/format";
import { feel } from "@/lib/feel/sounds";
import { readKept, send } from "@/lib/offline";
import { Fold } from "./Fold";
import { reactSaved } from "./reactions";
import { localToday, type Day } from "./types";

interface Note {
  date: string;
  time: string | null;
  text: string;
}

const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Today's Notes tab: everything you jot (here, on the Gate, with quick add), newest first, by date. Kept in
// the vault's Inbox/Inbox.md, private like the journal: shown live only, never built into pages.
// Adding works offline too: the note goes into the outbox and shows here at once.
// On top: the day's journal and keep line (they were on Today until the tabs gave them room again).
export function NotesTab({ day, readOnly, onSave }: { day: Day | null; readOnly: boolean; onSave(c: Partial<Day>): void }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState("");
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    readKept<{ notes: Note[] }>("notes").then(
      ({ data, saved }) => (setNotes(data?.notes ?? []), setOffline(saved)),
      () => setNotes([]),
    );
  }, []);

  const [msg, setMsg] = useState("");
  function add(kind: "inbox" | "brainstorm") {
    const body = text.trim();
    if (!body) return;
    send({ kind: "post", path: "capture", body: { kind, text: body } });
    if (kind === "inbox") setNotes((n) => [{ date: localToday(), time: now(), text: body }, ...(n ?? [])]);
    setMsg(kind === "brainstorm" ? "Brainstorm note made (in Brainstorm/)." : "");
    setText("");
    feel("saved");
  }

  const days = [...new Set((notes ?? []).map((n) => n.date))];
  return (
    <div className="flex flex-col gap-5">
      {day && !day.future && <Journal key={`${day.date}|${day.journal}|${day.keep}`} day={day} readOnly={readOnly} onSave={onSave} />}
      <div className="card flex flex-col gap-3 p-4 sm:p-5">
        <textarea
          className="today-input min-h-20"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A thought, an idea, something to remember…"
          aria-label="New note"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="chip edit-primary" onClick={() => add("inbox")} disabled={!text.trim()}>
            Save note
          </button>
          <button type="button" className="chip" onClick={() => add("brainstorm")} disabled={!text.trim()}>
            Brainstorm idea
          </button>
          {msg && <span className="text-xs text-ink-dim">{msg}</span>}
          {offline && <span className="text-xs text-ink-dim">Offline: saved here, sent when the PC answers.</span>}
        </div>
      </div>
      {notes === null ? (
        <p className="text-sm text-ink-dim">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-ink-dim">No notes yet. Anything you jot here, on the Gate or with quick add shows up here by date.</p>
      ) : (
        days.map((d) => (
          <section key={d} className="card p-4 sm:p-5" aria-label={dayLabel(d)}>
            <h2 className="mb-2 text-sm font-semibold text-ink-dim">{d === localToday() ? "Today" : dayLabel(d)}</h2>
            <ul className="flex flex-col divide-y divide-ink-dim/10">
              {notes
                .filter((n) => n.date === d)
                .map((n, i) => (
                  <li key={`${d}-${i}`} className="flex gap-3 py-2 text-sm">
                    <span className="w-11 shrink-0 text-xs text-ink-dim">{n.time ?? ""}</span>
                    <span className="whitespace-pre-wrap text-ink">{n.text}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

// The day's journal (private: never shown on the site) and its keep line (shown on the Habits page).
function Journal({ day, readOnly, onSave }: { day: Day; readOnly: boolean; onSave(c: Partial<Day>): void }) {
  const [journal, setJournal] = useState(day.journal);
  const [keep, setKeep] = useState(day.keep);
  const [saved, setSaved] = useState(true);
  const save = (e: React.MouseEvent<HTMLButtonElement>) => {
    onSave({ journal, keep });
    setSaved(true);
    reactSaved(e.currentTarget);
  };
  const when = day.date === localToday() ? "today" : dayLabel(day.date);
  return (
    <Fold id="journal" title="Journal" summary={journal.trim() ? `Written ${when} · private` : `${when} · private`} defaultOpen>
      <textarea className="today-input min-h-40" disabled={readOnly} value={journal} onChange={(e) => (setJournal(e.target.value), setSaved(false))} placeholder="How did the day go?" aria-label="Journal" />
      <label className="edit-field">
        <span>Keep line (shown on the Habits page)</span>
        <input className="today-input" disabled={readOnly} value={keep} onChange={(e) => (setKeep(e.target.value), setSaved(false))} placeholder="One line worth keeping" />
      </label>
      <button type="button" className="chip edit-primary w-fit" onClick={save} disabled={saved || readOnly}>
        {saved ? "Saved" : "Save journal"}
      </button>
    </Fold>
  );
}
