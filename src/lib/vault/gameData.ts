import { loadAchievements } from "./achievements";
import { loadAreas } from "./areas";
import { loadBooks } from "./books";
import { loadDaily } from "./daily";
import { computeGame, type GameState } from "./game";
import { loadGames } from "./games";
import { loadHabitDefinitions } from "./habits";
import { toYmd } from "./habitWindow";
import { loadMonthNotes } from "./months";

// The game state for the whole vault as of today (used by Today for live level-ups).
export function loadGame(): GameState {
  const habits = loadHabitDefinitions().items;
  const finished = [
    ...loadBooks().items.filter((b) => b.status === "finished").map((b) => ({ kind: "book" as const, finished: b.finished })),
    ...loadGames().items.filter((g) => g.status === "finished").map((g) => ({ kind: "game" as const, finished: g.finished })),
  ];
  return computeGame(habits, loadDaily(habits).items, loadAreas().items, loadAchievements().items, loadMonthNotes().items, toYmd(new Date()), finished);
}

// What Today needs: totals as built, plus each habit's current streak.
export interface GameSnapshot {
  xp: number;
  todayXp: number;
  level: number;
  streaks: Record<string, number>;
}
export function gameSnapshot(): GameSnapshot {
  const g = loadGame();
  return { xp: g.xp, todayXp: g.todayXp, level: g.level, streaks: Object.fromEntries(g.habits.map((h) => [h.id, h.streak])) };
}
