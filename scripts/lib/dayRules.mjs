// The rules that keep the daily record honest (owner's choice, Build 7):
// - A day is "finished" when the owner presses Finish day, or by itself the next day at 12:00.
//   A finished day refuses changes unless the change says it was made while the owner had unlocked it.
// - Days that have not come yet only take tasks (planning), not habits, numbers, mood or notes.
// - Every input carries the moment it was made on the device ("at"), so the note can show when each thing
//   was logged, and entries made after their day are marked "filled in later".
// Times are local wall-clock strings "YYYY-MM-DDTHH:MM" (the PC and the phone share a time zone).

const pad = (n) => String(n).padStart(2, "0");
export function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const isStamp = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);

// When a change was made: the device's time if given and believable, else now. Never in the future.
export function changeTime(at) {
  const now = stamp();
  if (!isStamp(at)) return now;
  return at > now ? now : at;
}

function nextNoon(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return stamp(d);
}

// The moment this day stops taking changes: when Finish day was pressed, else the next day at 12:00.
export function lockTime(date, data) {
  return isStamp(data.finished) ? data.finished : nextNoon(date);
}

export const isFuture = (date, at = stamp()) => date > at.slice(0, 10);

export class DayRuleError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Throws if a change to the day's record (not tasks) is not allowed at `at`.
export function checkRecordChange(date, data, at, unlocked) {
  if (isFuture(date, at)) throw new DayRuleError("This day has not come yet: only tasks can be added to it.", 400);
  if (!unlocked && at >= lockTime(date, data)) throw new DayRuleError("This day is finished. Unlock it on Today to change it.", 423);
}

export const MISSED_REASONS = ["tired", "busy", "travel", "forgot", "sick", "other"];
