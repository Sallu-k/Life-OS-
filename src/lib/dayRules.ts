// The honest-record rules on the device (the PC enforces the same in scripts/lib/dayRules.mjs):
// a day locks when Finish day is pressed or the next day at 12:00; future days only take tasks;
// every input carries the time it was made. Times are local "YYYY-MM-DDTHH:MM".

const pad = (n: number) => String(n).padStart(2, "0");
export function stamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function lockTime(date: string, finished: string | null): string {
  if (finished) return finished;
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return stamp(d);
}

export const isFuture = (date: string) => date > stamp().slice(0, 10);
export const isLockedNow = (lockAt: string) => stamp() >= lockAt;

// "6 Nov, 09:12" for a stamp.
export function whenLabel(at: string): string {
  const d = new Date(`${at}:00`);
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}, ${at.slice(11, 16)}`;
}

// Entered after its day ended?
export const late = (date: string, at: string | undefined) => Boolean(at && at.slice(0, 10) > date);

export const MISSED_REASONS = [
  ["tired", "Tired"],
  ["busy", "Busy"],
  ["travel", "Travel"],
  ["forgot", "Forgot"],
  ["sick", "Sick"],
  ["other", "Other"],
] as const;
export type MissedReason = (typeof MISSED_REASONS)[number][0];

export const MOODS = [
  [1, "😣", "Awful"],
  [2, "😕", "Low"],
  [3, "😐", "Okay"],
  [4, "🙂", "Good"],
  [5, "😄", "Great"],
] as const;
