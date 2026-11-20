// Reward time you earn (you name the reward in Settings: gaming, a series, ...): an early night and the
// habits you choose bank minutes; using the reward spends them. Worked out from the daily notes every time (nothing stored but `played_min` per day).
// Forgiving: the bank never goes below zero (no debt) and is capped so it cannot pile up forever.
import { dayFacts, minutesAfter } from "./days.mjs";
import { readSettings } from "./settings.mjs";

const DAYS = 60;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// What one day earned: an early night (bedtime by the target, or the bedtime habit marked done) and each
// habit from `rewards.earn` that was done.
export function earnedOn(facts, { sleep, rewards }) {
  if (!facts) return { night: false, habits: [], minutes: 0 };
  const night = (facts.bedtime !== null && minutesAfter(facts.bedtime, sleep.by) <= 0) || (sleep.habit !== null && facts.states[sleep.habit] === "done");
  const habits = Object.keys(rewards.earn).filter((id) => facts.states[id] === "done");
  return { night, habits, minutes: (night ? rewards.night : 0) + habits.reduce((s, id) => s + rewards.earn[id], 0) };
}

export function getRewards(today) {
  const settings = readSettings();
  const start = new Date(`${today}T12:00:00`);
  start.setDate(start.getDate() - (DAYS - 1));
  let bank = 0;
  const days = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const date = ymd(d);
    const facts = dayFacts(date);
    const earned = earnedOn(facts, settings);
    // Earn first (capped), then spend; never below zero.
    bank = Math.max(0, Math.min(settings.rewards.cap, bank + earned.minutes) - (facts?.played ?? 0));
    days.push({ date, ...earned, played: facts?.played ?? 0, bedtime: facts?.bedtime ?? null, pages: facts?.pages ?? 0, states: facts?.states ?? {} });
  }
  // This week, Monday to today (the Core habits card counts its weekly targets here).
  const sinceMonday = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
  return { bank, cap: settings.rewards.cap, per: settings.rewards, sleep: settings.sleep, today: days.at(-1), week: days.slice(-1 - sinceMonday) };
}
