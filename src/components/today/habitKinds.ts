// The same rules as scripts/lib/days.mjs (markFromParts, markFromAmount), so a habit's own mark updates on
// screen at once when one of its parts or its amount changes.
import type { DayHabit, Mark } from "./types";

export const DEFAULT_MARKS: Mark[] = ["done", "half", "partial", "missed"];
const PART_VALUE: Partial<Record<Mark, number>> = { done: 1, half: 0.5, partial: 0.25, missed: 0 };

// All parts done -> done, half or more -> half, any -> showed up; parts not marked yet count as not done.
export function markFromParts(states: Record<string, Mark>, parts: NonNullable<DayHabit["parts"]>): Mark | null {
  const counted = parts.filter((p) => states[p.id] !== "na");
  if (!counted.some((p) => states[p.id])) return null;
  const avg = counted.reduce((s, p) => s + (PART_VALUE[states[p.id]] ?? 0), 0) / counted.length;
  return avg >= 1 ? "done" : avg >= 0.5 ? "half" : avg > 0 ? "partial" : "missed";
}

// The goal reached -> done, half of it -> half, some -> showed up; without a goal any amount is done.
export function markFromAmount(amount: number | null, goal?: number): Mark | null {
  if (amount === null) return null;
  if (!goal) return amount > 0 ? "done" : "missed";
  return amount >= goal ? "done" : amount >= goal / 2 ? "half" : amount > 0 ? "partial" : "missed";
}
