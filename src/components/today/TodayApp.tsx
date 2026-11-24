"use client";

import { SaveLine } from "@/components/knowledge/SaveLine";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useIsApp, useServer } from "@/lib/api";
import { isLockedNow, stamp, type MissedReason } from "@/lib/dayRules";
import { feel } from "@/lib/feel/sounds";
import { dayLabel } from "@/lib/format";
import { loadDay, outbox, queue, savedDay, send } from "@/lib/offline";
import { scheduleReminders } from "@/lib/phoneReminders";
import { savedSetup } from "@/lib/anchors";
import { boredMinutes, gateOn, gateSync, lastNight, phoneScreenHours, takeGateQueue, takeWidgetTicks, updateWidget } from "@/lib/device";
import type { GameSnapshot } from "@/lib/vault/gameData";
import { DayState } from "./DayState";
import { FunList } from "./FunList";
import { MoodSleep } from "./MoodSleep";
import { ReviewPrompt } from "./ReviewPrompt";
import { HabitList } from "./HabitList";
import { Fold } from "./Fold";
import { markFromAmount, markFromParts } from "./habitKinds";
import { TodaySummary } from "./TodaySummary";
import { HabitManager } from "./HabitManager";
import { markSeen, reactFun, reactMark, reactSaved, reactTask, type FeelContext } from "./reactions";
import { NotesTab } from "./NotesTab";
import { FoodTab } from "./FoodTab";
import { PlanApp } from "@/components/plan/PlanApp";
import { Incentives } from "./Incentives";
import { SecondDate } from "./SecondDate";
import { localToday, shift, type Day, type Mark, type Task } from "./types";
import { useReminders } from "./useReminders";

type Tab = "today" | "tasks" | "food" | "notes";
const TABS: [Tab, string][] = [
  ["today", "Today"],
  ["tasks", "Tasks"],
  ["food", "Food"],
  ["notes", "Notes"],
];

// The Today screen, in four tabs: Today (summary, habits, the day's cards), Tasks (every open task), Food
// (what was eaten: protein and calories) and Notes.
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
  // Four tabs: Today (summary and habits), Tasks (every open task, deadlines first), Food, Notes (by date).
  const [tab, setTab] = useState<Tab>("today");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lifeos-today-tab") as Tab | null;
      if (saved && TABS.some(([k]) => k === saved)) setTab(saved);
    } catch {
      // no storage: start on Today
    }
  }, []);
  const pickTab = (next: Tab) => {
    feel("select");
    setTab(next);
    try {
      localStorage.setItem("lifeos-today-tab", next);
    } catch {
      // not remembered
    }
  };
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
    await updateWidget(today.date, today.habits); // also gives the Gate the PC address and token
    void gateOn().then(() => gateSync(today.date, Object.fromEntries(place.anchors.map((a) => [a.label, a.time])))); // also logs "off" once if the Gate was switched off
    // Notes and tasks made on the Gate join the app's outbox: they show here at once and reach the PC
    // through whichever address answers (the Gate alone could only try one).
    let current = today;
    for (const item of await takeGateQueue()) {
      if (item.path === "task") {
        const date = item.body.date ?? today.date;
        const task: Task = { done: false, text: item.body.text, time: null, priority: null, index: current.tasks.length, date };
        current = date === today.date ? { ...current, tasks: [...current.tasks, task] } : current;
        queue({ kind: "taskAdd", date, body: { text: item.body.text } }, current);
      } else send({ kind: "post", path: "capture", body: item.body });
    }
    if (current !== today) setDay(current);
    const ticks = await takeWidgetTicks();
    for (const t of ticks) {
      const cached = t.date === today.date ? { ...today, habits: today.habits.map((h) => (h.id === t.id ? { ...h, state: t.state as Mark | null } : h)) } : today;
      queue({ kind: "day", date: t.date, body: { habits: { [t.id]: t.state }, at: t.at } }, cached);
    }
    await syncSleep(today.date);
    const hours = await phoneScreenHours(today.date);
    if (hours !== null && Math.abs(hours - (today.phoneHours ?? -1)) >= 0.1) queue({ kind: "day", date: today.date, body: { phoneHours: hours } }, { ...today, phoneHours: hours });
    const bored = await boredMinutes(today.date);
    if (bored !== null && bored !== today.boredMin) queue({ kind: "day", date: today.date, body: { boredMin: bored } }, { ...today, boredMin: bored });
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
  // After midnight, a page that was showing today moves on to the new day (the app can stay open overnight).
  const todayWas = useRef(localToday());
  const newDay = useCallback(() => {
    const now = localToday();
    if (now === todayWas.current) return false;
    const was = todayWas.current;
    todayWas.current = now;
    if (date !== was) return false; // looking at another day on purpose: stay there
    setDate(now);
    return true;
  }, [date]);
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && !newDay() && load();
    document.addEventListener("visibilitychange", onShow);
    const timer = setInterval(() => !newDay() && outbox().length && load(), 30_000);
    return () => (document.removeEventListener("visibilitychange", onShow), clearInterval(timer));
  }, [load, newDay]);
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
  // One part of a habit (e.g. the breakfast part of "Meals"): the habit's own mark follows its parts.
  function markPart(id: string, part: string, state: Mark | null, button: Element | null) {
    if (!day || readOnly) return;
    const habits = day.habits.map((h) => {
      if (h.id !== id) return h;
      const partStates = { ...(h.partStates ?? {}) };
      if (state) partStates[part] = state;
      else delete partStates[part];
      return { ...h, partStates, state: markFromParts(partStates, h.parts ?? []) };
    });
    const updated = { ...day, habits };
    reactMark(day, updated, id, habits.find((h) => h.id === id)?.state ?? null, button, feelCtx.current);
    change({ kind: "day", date, body: { parts: { [id]: { [part]: state } } } }, updated);
  }
  // A counted habit's amount (e.g. pages of a book): the mark follows the amount and the goal.
  function setAmount(id: string, amount: number | null) {
    if (!day || readOnly) return;
    const habits = day.habits.map((h) => (h.id === id ? { ...h, amount, state: markFromAmount(amount, h.goal) } : h));
    change({ kind: "day", date, body: { amounts: { [id]: amount } } }, { ...day, habits });
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
      <div className="today-tabs" role="tablist" aria-label="Today">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="today-tab" onClick={() => pickTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {/* key={tab}: each tab change replays the panel's short fade-and-slide (globals.css .tab-panel) */}
      <div key={tab} className="tab-panel flex flex-col gap-6" role="tabpanel">
      {tab === "tasks" && <PlanApp tasksOnly />}
      {tab === "food" && <FoodTab day={day} readOnly={readOnly} onSave={save} />}
      {tab === "notes" && <NotesTab day={day} readOnly={readOnly} onSave={save} />}
      {tab === "today" && (
        <>
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
              {!day.future && <TodaySummary day={day} place={place} />}
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
              {!day.future && <HabitList date={date} place={place} habits={day.habits} readOnly={readOnly} missed={day.missed} logged={day.logged} onMark={mark} onPart={markPart} onAmount={setAmount} onReason={reason} />}
              {isToday && <Incentives day={day} game={game} onSave={(c) => change({ kind: "day", date, body: c }, { ...day, ...c })} />}
              {!day.future && <MoodSleep day={day} readOnly={readOnly} onSave={save} />}
              {!day.future && <Numbers day={day} readOnly={readOnly} onSave={save} />}
              {!day.future && <FunList key={date} items={day.fun} readOnly={readOnly} onChange={saveFun} />}
            </div>
          )}
        </>
      )}
      </div>
      {setup &&<HabitManager onClose={(saved) => (setSetup(false), saved && load())} />}
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
    <Fold id="numbers" title="Numbers" summary={[day.productivity !== null ? `${day.productivity}% productive` : null, day.screenTime !== null ? `${day.screenTime} h screen` : null, day.pages ? `${day.pages} pages` : null].filter(Boolean).join(" · ") || "Productivity, screen time, pages"}>
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
      {!readOnly && <SaveLine books={reading} />}
    </Fold>
  );
}

// Screen time measured on the PC (and the phone, when the app has usage access): shown next to the
// number you typed, with one tap to use it. When the day closes, the measured total is used if you
// typed nothing.
function MeasuredScreen({ day, readOnly, onSave }: { day: Day; readOnly: boolean; onSave(c: Partial<Day>): void }) {
  const pc = day.pcHours ?? null;
  const phone = day.phoneHours ?? null;
  const gate = day.gate && day.gate.gates > 0 ? `Unlocks: ${day.gate.gates} (${day.gate.fun} for fun)` : null;
  const bored = day.boredMin ? `longest phone-free stretch ${day.boredMin} min` : null;
  const extra = [gate, bored].filter(Boolean).join(" · ");
  if (pc === null && phone === null) return extra ? <p className="text-xs text-ink-dim">{extra}</p> : null;
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
      {extra && <span>· {extra}</span>}
    </p>
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
