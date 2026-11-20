import type { HabitState } from "./types";

// How much each mark counts. "Not applicable" and "no entry" are left out, so they never pull a score down.
export const SCORE: Partial<Record<HabitState, number>> = { done: 1, half: 0.5, partial: 0.25, missed: 0 };

// The average of the marks that count (0 to 1), and how many there were. null when nothing counts.
export function scoreOf(states: HabitState[]): { value: number | null; days: number } {
  let total = 0;
  let days = 0;
  for (const state of states) {
    const points = SCORE[state];
    if (points === undefined) continue;
    total += points;
    days++;
  }
  return { value: days === 0 ? null : total / days, days };
}
