"use client";

import { useEffect, useState } from "react";
import { useIsApp, useServer } from "@/lib/api";
import { keptCopy, readKept, saveOrQueue } from "@/lib/offline";
import { feel } from "@/lib/feel/sounds";
import { replay } from "@/lib/feel/motion";
import { dayLabel } from "@/lib/format";
import { shiftWeek, thisWeek } from "@/lib/week";

interface Review {
  id: string;
  from: string;
  to: string;
  done: boolean;
  savedAt: string | null;
  stats: {
    daysLogged: number;
    habitsDone: number | null;
    productivity: number | null;
    screenTime: number | null;
    sleep: number | null;
    mood: number | null;
    pages: number;
    tasksDone: number;
    fun: number;
    strongest: string | null;
    needsCare: string | null;
    knowledge?: { cards: number; knew: number; notyet: number; passages: number };
    gate?: { gates: number; unlock: number; fun: number; read: number; more: number; funMinutes: number; urgentBefore: number };
  };
  wins: string;
  lessons: string;
  focus: string;
}

const PROMPTS = [
  ["wins", "Wins", "What went well this week, big or small?"],
  ["lessons", "Lessons", "What got in the way, and what did you learn?"],
  ["focus", "Next week", "One or two things to focus on next week."],
] as const;

// The weekly review: the week's numbers filled in from the daily notes, then three short answers.
// Saved to Weekly/YYYY-Www.md in the vault (private, like the journal).
export function WeeklyReview() {
  const server = useServer();
  const app = useIsApp();
  const [id, setId] = useState(thisWeek);
  const [r, setR] = useState<Review | null>(null);
  const [text, setText] = useState({ wins: "", lessons: "", focus: "" });
  const [msg, setMsg] = useState("");
  // A link can open a given week: /review/#2026-W45
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (/^\d{4}-W\d{2}$/.test(hash)) setId(hash);
  }, []);

  useEffect(() => {
    if (!server && !app) return;
    const kept = keptCopy<Review>(`review/${id}`);
    setR(kept);
    if (kept) setText({ wins: kept.wins, lessons: kept.lessons, focus: kept.focus });
    setMsg("");
    readKept<Review>(`review/${id}`).then(
      ({ data: x, saved }) => {
        if (x) (setR(x), setText({ wins: x.wins, lessons: x.lessons, focus: x.focus }));
        if (saved) setMsg(x ? "Offline: showing this week as saved on this phone." : "The PC is not reachable and this week is not saved on this phone yet.");
      },
      (e: Error) => setMsg(e.message),
    );
  }, [id, server, app]);

  async function save(e: React.MouseEvent<HTMLButtonElement>) {
    const button = e.currentTarget;
    try {
      const { data: x, queued } = await saveOrQueue<Review>(`review/${id}`, text);
      if (x) setR(x);
      feel("finished");
      replay(button, "feel-saved");
      setMsg(queued ? "Saved on this phone; it goes to your vault when the PC is reachable." : "Saved to your vault.");
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  if (server === false && !app) return <p className="card p-5 text-sm text-ink-dim">The weekly review works through the LifeOS server on your PC.</p>;
  const s = r?.stats;
  const tile = (label: string, value: string | number | null) => (
    <div className="card flex flex-col gap-1 px-4 py-3">
      <span className="text-xs uppercase tracking-[0.14em] text-ink-dim">{label}</span>
      <span className="font-serif text-2xl text-ink">{value ?? "—"}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="chip" onClick={() => setId(shiftWeek(id, -1))} aria-label="Previous week">
          ←
        </button>
        <span className="text-sm text-ink">{r ? `${dayLabel(r.from, true)} – ${dayLabel(r.to, true)}` : id}</span>
        <button type="button" className="chip" onClick={() => setId(shiftWeek(id, 1))} aria-label="Next week" disabled={id === thisWeek()}>
          →
        </button>
        {r?.done && <span className="badge">Reviewed</span>}
      </div>

      {!s ? (
        <p className="text-ink-dim">{msg || "Loading…"}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tile("Days logged", `${s.daysLogged} of 7`)}
            {tile("Habits done", s.habitsDone !== null ? `${s.habitsDone}%` : null)}
            {tile("Productivity", s.productivity !== null ? `${s.productivity}%` : null)}
            {tile("Screen time", s.screenTime !== null ? `${s.screenTime} h` : null)}
            {tile("Sleep", s.sleep !== null ? `${s.sleep} h` : null)}
            {tile("Mood", s.mood !== null ? `${s.mood} / 5` : null)}
            {tile("Pages read", s.pages)}
            {tile("Tasks done", s.tasksDone)}
          </div>
          {s.gate && s.gate.gates > 0 && <GateWeek g={s.gate} />}
          {s.knowledge && s.knowledge.cards + s.knowledge.passages > 0 && (
            <p className="text-sm text-ink-dim">
              Knowledge: <span className="text-ink">{s.knowledge.cards}</span> cards, {s.knowledge.passages} passages read
              {s.knowledge.knew + s.knowledge.notyet > 0 && `, recalled ${s.knowledge.knew} of ${s.knowledge.knew + s.knowledge.notyet}`}.
            </p>
          )}
          {(s.strongest || s.needsCare) && (
            <p className="text-sm text-ink-dim">
              {s.strongest && (
                <>
                  Strongest habit: <span className="text-ink">{s.strongest}</span>.{" "}
                </>
              )}
              {s.needsCare && (
                <>
                  Needs care: <span className="text-ink">{s.needsCare}</span>.
                </>
              )}
            </p>
          )}
          <div className="flex flex-col gap-4">
            {PROMPTS.map(([key, title, hint]) => (
              <label key={key} className="edit-field">
                <span className="font-serif text-lg text-ink">{title}</span>
                <textarea className="today-input min-h-24" value={text[key]} placeholder={hint} onChange={(e) => setText({ ...text, [key]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="chip edit-primary w-fit px-5 py-2" onClick={save}>
              {r?.done ? "Save changes" : "Save review"}
            </button>
            <span className="text-sm text-ink-dim">{msg}</span>
          </div>
        </>
      )}
    </div>
  );
}

// The Gate's week: why the screens were opened. Many "urgent" unlocks get a gentle question, never a limit.
function GateWeek({ g }: { g: NonNullable<Review["stats"]["gate"]> }) {
  const up = g.unlock > g.urgentBefore + 5 && g.unlock >= 20;
  return (
    <p className="text-sm text-ink-dim">
      The Gate: <span className="text-ink">{g.gates}</span> unlocks, {g.unlock} urgent, {g.fun} for fun ({g.funMinutes} min{g.more ? `, extended ${g.more} times` : ""}), the book won {g.read}.
      {up && ` ${g.unlock} urgent unlocks, up from ${g.urgentBefore} last week. Were they all urgent?`}
    </p>
  );
}
