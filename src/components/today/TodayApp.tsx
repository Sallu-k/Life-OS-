"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, useIsApp, useServer } from "@/lib/api";
import { isLockedNow, stamp, type MissedReason } from "@/lib/dayRules";
import { feel } from "@/lib/feel/sounds";
import { dayLabel } from "@/lib/format";
import { loadDay, outbox, queue, savedDay, send } from "@/lib/offline";
import { scheduleReminders } from "@/lib/phoneReminders";
import { savedSetup } from "@/lib/anchors";
import { lastNight, phoneScreenHours, takeWidgetTicks, updateWidget } from "@/lib/device";
import type { GameSnapshot } from "@/lib/vault/gameData";
import { DayState } from "./DayState";
import { FunList } from "./FunList";
import { MoodSleep } from "./MoodSleep";
import { ReviewPrompt } from "./ReviewPrompt";
import { HabitList } from "./HabitList";
import { HabitManager } from "./HabitManager";
import { liveXp, markSeen, reactFun, reactMark, reactSaved, reactTask, type FeelContext } from "./reactions";
import { TodayTasks } from "./TodayTasks";
import { Incentives } from "./Incentives";
import { SecondDate } from "./SecondDate";
import { localToday, shift, type Day, type Mark, type Task } from "./types";
import { useReminders } from "./useReminders";

// The Today screen: due habits, tasks, the day's numbers, journal and quick capture.
// Changes are applied on screen at once, kept on the device and sent to the LifeOS server (lib/offline.ts),
// so the phone app keeps working without the PC and catches up when it can reach it again.
// `game` comes from the build; when the PC answers, its current setting wins.
export function TodayApp({ game: built = true, snapshot }: { game?: boolean; snapshot?: GameSnapshot }) {
  const server = useServer();
  const game = server && typeof server.game === "boolean" ? server.game : built;
  // Anchors and the second calendar (PC settings, remembered on the phone for offline use).
  const [place, setPlace] = useState(() => savedSetup(null));
  useEffect(() => {
    if (server && server.day) setPlace(savedSetup(server.day));
  }, [server]);
  const app = useIsApp();
  const [date, setDate] = useState(localToday);
  const [day, setDay] = useState<Day | null>(null);
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  // Unlocking a finished day lasts until you leave that day.
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => setUnlocked(false), [date]);
  const feelCtx = useRef<FeelContext>({ game: built, snapshot, extra: { xp: 0 }, streaked: new Set() });
  feelCtx.current.game = game;
  useEffect(() => {
    if (snapshot) markSeen(snapshot.level); // the built level is not news on this page
  }, [snapshot]);

  const load = useCallback(() => {
    loadDay(date).then(
      (r) => {
        setDay(r.day);
        setOnline(r.online);
        setWaiting(outbox().length);
        setLoaded(true);
        setError("");
        if (r.day && r.day.date === localToday()) {
          scheduleReminders(r.day, place).catch(() => undefined);
          if (app) void phoneSync(r.day);
        }
      },
      (e: Error) => (setError(e.message), setLoaded(true)),
    );
  }, [date, place, app]);

  // Phone app: give the home-screen widget today's habits, bring in ticks made on the widget, and send
  // the phone's measured screen time when it has changed.
  async function phoneSync(today: Day) {
    void updateWidget(today.date, today.habits);
    const ticks = await takeWidgetTicks();
    for (const t of ticks) {
      const cached = t.date === today.date ? { ...today, habits: today.habits.map((h) => (h.id === t.id ? { ...h, state: t.state as Mark | null } : h)) } : today;
      queue({ kind: "day", date: t.date, body: { habits: { [t.id]: t.state }, at: t.at } }, cached);
    }
    await syncSleep(today.date);
    const hours = await phoneScreenHours(today.date);
    if (hours !== null && Math.abs(hours - (today.phoneHours ?? -1)) >= 0.1) queue({ kind: "day", date: today.date, body: { phoneHours: hours } }, { ...today, phoneHours: hours });
    if (ticks.length || (hours !== null && Math.abs(hours - (today.phoneHours ?? -1)) >= 0.1)) setTimeout(load, 500);
  }
  // Show what this device has for the day straight away; the PC's copy replaces it when it answers.
  useEffect(() => {
    if (!app) return;
    const saved = savedDay(date);
    if (saved) {
      setDay((d) => (d && d.date === date ? d : saved));
      setLoaded(true);
    }
  }, [app, date]);
  useEffect(() => {
    if (server || app) load();
  }, [server, app, load]);
  // Catch up when the app comes back to the front, and every 30 s while changes are waiting.
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    const timer = setInterval(() => outbox().length && load(), 30_000);
    return () => (document.removeEventListener("visibilitychange", onShow), clearInterval(timer));
  }, [load]);
  useReminders(!app && date === localToday() ? day : null, place);

  if (!app && server === null) return <p className="text-ink-dim">Connecting…</p>;
  if (!app && server === false)
    return (
      <p className="card p-5 text-sm text-ink-dim">
        Today works through the LifeOS server. On the PC run <code>npm start</code> and open the address it prints. On the phone, use the LifeOS app.
      </p>
    );

  // Apply a change on screen and in the outbox; then send it and refresh. Day changes carry the moment
  // they were made (for the record and for the lock check) and whether the day was unlocked.
  function change(op: Parameters<typeof queue>[0], updated: Day) {
    if (op.kind === "day") op = { ...op, body: { ...op.body, at: stamp(), ...(unlocked ? { unlock: true } : {}) } };
    setDay(updated);
    queue(op, updated);
    if (app && updated.date === localToday()) void updateWidget(updated.date, updated.habits);
    setWaiting(outbox().length);
    load();
  }
  // Habits, numbers, mood, fun and notes are closed on future days and on finished days (unless unlocked).
  const readOnly = !day || day.future || (isLockedNow(day.lockAt) && !unlocked);
  function save(changes: Partial<Day>) {
    if (day && !readOnly) change({ kind: "day", date, body: changes }, { ...day, ...changes });
  }
  function reason(id: string, why: MissedReason | null) {
    if (!day || readOnly) return;
    const missed = { ...day.missed };
    if (why) missed[id] = why;
    else delete missed[id];
    change({ kind: "day", date, body: { missed: { [id]: why } } }, { ...day, missed });
  }
  function finish() {
    if (!day || day.future) return;
    const at = stamp();
    feel("finished");
    setUnlocked(false);
    change({ kind: "day", date, body: { finish: true } }, { ...day, finished: at, lockAt: at, locked: true });
  }
  function saveFun(fun: string[]) {
    if (!day || readOnly) return;
    const updated = { ...day, fun };
    reactFun(day, updated, feelCtx.current);
    change({ kind: "day", date, body: { fun } }, updated);
  }
  function mark(id: string, state: Mark | null, button: Element | null) {
    if (!day || readOnly) return;
    const updated = { ...day, habits: day.habits.map((h) => (h.id === id ? { ...h, state } : h)) };
    reactMark(day, updated, id, state, button, feelCtx.current);
    change({ kind: "day", date, body: { habits: { [id]: state } } }, updated);
  }
  function editTask(t: Task, changes: Record<string, unknown>, row: Element | null = null) {
    if (!day) return;
    const gone = Boolean(changes.remove || changes.moveTo || (t.date !== date && changes.done));
    const apply = (list: Task[]) => (gone ? list.filter((x) => x !== t) : list.map((x) => (x === t ? ({ ...x, ...changes } as Task) : x)));
    const updated = t.date === date ? { ...day, tasks: apply(day.tasks) } : { ...day, carried: apply(day.carried) };
    reactTask(day, updated, t, changes, row, feelCtx.current);
    // Let the strike-through play before a carried task leaves the list.
    const send = () => change({ kind: "taskEdit", date: t.date, matchText: t.text, body: changes }, updated);
    if (gone && changes.done) setTimeout(send, 380);
    else send();
  }

  const isToday = date === localToday();
  return (
    <div className="flex flex-col gap-6">
      <div className="today-bar">
        <div className="today-nav">
          <button type="button" className="chip" onClick={() => setDate(shift(date, -1))} aria-label="Previous day">
            ←
          </button>
          <input type="date" className="today-input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day" />
          <button type="button" className="chip" onClick={() => setDate(shift(date, 1))} aria-label="Next day">
            →
          </button>
          {!isToday && (
            <button type="button" className="chip" onClick={() => setDate(localToday())}>
              Today
            </button>
          )}
        </div>
        <div className="today-meta">
          <span className="text-sm text-ink-dim">{dayLabel(date)}</span>
          <SecondDate date={date} setup={place} onSetup={setPlace} />
          {day && game && <span className="badge text-brass">+{liveXp(day)} XP</span>}
          <button type="button" className="chip ml-auto" onClick={() => setSetup(true)}>
            ⚙ Set up habits
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-copper">{error}</p>}
      <SyncBadge online={online} waiting={waiting} />

      {!day ? (
        <p className="text-ink-dim">
          {!loaded ? "Loading…" : "Can't reach the PC yet and nothing is saved on this device. Check the PC address and token on the Settings page, and that the PC is on with Tailscale running."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {isToday && <ReviewPrompt />}
          <DayState
            date={date}
            future={day.future}
            locked={isLockedNow(day.lockAt)}
            unlocked={unlocked}
            finished={day.finished}
            lockAt={day.lockAt}
            isToday={isToday}
            onFinish={finish}
            onUnlock={() => (feel("open"), setUnlocked(true))}
            onRelock={() => (feel("close"), setUnlocked(false))}
          />
          {isToday && <Incentives day={day} game={game} onSave={(c) => change({ kind: "day", date, body: c }, { ...day, ...c })} />}
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col gap-6">
            {!day.future && <HabitList date={date} place={place} habits={day.habits} readOnly={readOnly} missed={day.missed} logged={day.logged} onMark={mark} onReason={reason} />}
            {!day.future && <MoodSleep day={day} readOnly={readOnly} onSave={save} />}
            {!day.future && <Numbers day={day} readOnly={readOnly} onSave={save} />}
            {!day.future && <FunList key={date} items={day.fun} readOnly={readOnly} onChange={saveFun} />}
          </div>
          <div className="flex flex-col gap-6">
            <TodayTasks date={date} dayTasks={day.tasks} onDayEdit={editTask} place={place} />
            {!day.future && <Journal key={date} day={day} readOnly={readOnly} onSave={save} />}
            <Capture />
          </div>
        </div>
        </div>
      )}
      {setup && <HabitManager onClose={(saved) => (setSetup(false), saved && load())} />}
    </div>
  );
}

function Numbers({ day, readOnly, onSave }: { day: Day; readOnly: boolean; onSave(c: Partial<Day>): void }) {
  const field = (key: "productivity" | "screenTime" | "pages", label: string, unit: string, step = 1, extra?: Partial<Day>) => (
    <label className="edit-field min-w-0">
      <span>
        {label} <em className="not-italic opacity-70">{unit}</em>
      </span>
      <input
        key={`${day.date}-${key}-${day[key]}`}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        disabled={readOnly}
        className="today-input w-full min-w-0"
        defaultValue={day[key] ?? ""}
        onBlur={(e) => {
          const v = e.target.value === "" ? null : Number(e.target.value);
          if (v !== day[key]) (onSave({ [key]: v, ...extra }), reactSaved(null));
        }}
      />
    </label>
  );
  // Pages read move the chosen book forward (the one picked before, else the first being read).
  const reading = day.reading ?? [];
  const book = day.pagesBook ?? reading[0]?.slug ?? null;
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-label="The day in numbers">
      <div className="grid grid-cols-3 gap-3">
        {field("productivity", "Productivity", "%")}
        {field("screenTime", "Screen", "hours", 0.25)}
        {field("pages", "Pages", "read", 1, book ? { pagesBook: book } : undefined)}
      </div>
      <MeasuredScreen day={day} readOnly={readOnly} onSave={onSave} />
      {reading.length > 0 && (
        <label className="edit-field">
          <span>Pages go to</span>
          <select
            className="today-input"
            disabled={readOnly}
            value={book ?? ""}
            onChange={(e) => onSave({ pagesBook: e.target.value, ...(day.pages !== null ? { pages: day.pages } : {}) })}
          >
            {reading.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.title} · page {b.progress}
                {b.pages ? ` of ${b.pages}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

// Screen time measured on the PC (and the phone, when the app has usage access): shown next to the
// number you typed, with one tap to use it. When the day closes, the measured total is used if you
// typed nothing.
function MeasuredScreen({ day, readOnly, onSave }: { day: Day; readOnly: boolean; onSave(c: Partial<Day>): void }) {
  const pc = day.pcHours ?? null;
  const phone = day.phoneHours ?? null;
  if (pc === null && phone === null) return null;
  const total = Math.round(((pc ?? 0) + (phone ?? 0)) * 10) / 10;
  const parts = [pc !== null && `PC ${pc} h`, phone !== null && `phone ${phone} h`].filter(Boolean).join(" + ");
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-dim">
      <span>
        Measured: {parts}
        {pc !== null && phone !== null ? ` = ${total} h` : ""}
      </span>
      {!readOnly && day.screenTime !== total && (
        <button type="button" className="chip text-xs" onClick={() => (onSave({ screenTime: total }), reactSaved(null))}>
          Use {total} h
        </button>
      )}
    </p>
  );
}

function Journal({ day, readOnly, onSave }: { day: Day; readOnly: boolean; onSave(c: Partial<Day>): void }) {
  const [journal, setJournal] = useState(day.journal);
  const [keep, setKeep] = useState(day.keep);
  const [saved, setSaved] = useState(true);
  const dirty = () => setSaved(false);
  const save = (e: React.MouseEvent<HTMLButtonElement>) => {
    onSave({ journal, keep });
    setSaved(true);
    reactSaved(e.currentTarget);
  };
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="journal-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="journal-heading" className="font-serif text-xl text-ink">
          Journal
        </h2>
        <span className="text-xs text-ink-dim">Private · never shown on the site</span>
      </div>
      <textarea className="today-input min-h-40" disabled={readOnly} value={journal} onChange={(e) => (setJournal(e.target.value), dirty())} placeholder="How did the day go?" />
      <label className="edit-field">
        <span>Keep line (shown on the Habits page)</span>
        <input className="today-input" disabled={readOnly} value={keep} onChange={(e) => (setKeep(e.target.value), dirty())} placeholder="One line worth keeping" />
      </label>
      <button type="button" className="chip edit-primary w-fit" onClick={save} disabled={saved || readOnly}>
        {saved ? "Saved" : "Save journal"}
      </button>
    </section>
  );
}

function Capture() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  async function send(kind: "inbox" | "brainstorm") {
    if (!text.trim()) return;
    try {
      const r = await api<{ saved: string }>("capture", { method: "POST", body: { kind, text } });
      setMsg(`Saved to ${r.saved}`);
      setText("");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="capture-heading">
      <h2 id="capture-heading" className="font-serif text-xl text-ink">
        Quick capture
      </h2>
      <textarea className="today-input min-h-20" value={text} onChange={(e) => setText(e.target.value)} placeholder="A thought, an idea, something to look up…" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="chip" onClick={() => send("inbox")}>
          To Inbox
        </button>
        <button type="button" className="chip" onClick={() => send("brainstorm")}>
          New Brainstorm idea
        </button>
        <span className="text-xs text-ink-dim">{msg}</span>
      </div>
    </section>
  );
}

// Sync state as a small floating badge (it never pushes the page around). A change that reaches the
// PC within 2 s shows nothing at all; offline, or a slow send, shows how many changes are waiting.
function SyncBadge({ online, waiting }: { online: boolean; waiting: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (waiting === 0) return setSlow(false);
    const timer = setTimeout(() => setSlow(true), 2000);
    return () => clearTimeout(timer);
  }, [waiting]);
  if (online && !(waiting > 0 && slow)) return null;
  return (
    <p className="sync-badge" role="status">
      {online ? "Sending" : "Offline · saved on this device"}
      {waiting > 0 && ` · ${waiting} waiting`}
    </p>
  );
}

// Phone app, once each morning: last night's bedtime and wake time (from the screen going off and on)
// go to the PC, which puts them on the right notes and marks the bedtime habit (scripts/lib/days.mjs).
async function syncSleep(today: string) {
  const key = `lifeos-sleep-sent:${today}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch {
    return;
  }
  const night = await lastNight(today);
  if (!night) return; // still asleep, the phone was off, or no usage access
  const evening = shift(today, -1);
  send({ kind: "put", path: "sleep", body: { night: evening, ...night } });
  try {
    localStorage.setItem(key, `${night.bed}-${night.wake}`);
  } catch {
    // sent once more next time: the server just writes the same times again
  }
}
