import type { Metadata } from "next";
import { BalanceExplorer } from "@/components/BalanceExplorer";
import { StatusWindow } from "@/components/StatusWindow";
import { LevelReveal } from "@/components/feel/LevelReveal";
import { PageHeader } from "@/components/PageHeader";
import { VaultWarnings } from "@/components/VaultWarnings";
import { loadAchievements } from "@/lib/vault/achievements";
import { loadAreas } from "@/lib/vault/areas";
import { computeBalance, defaultWindow, resolveAreas } from "@/lib/vault/balance";
import { balanceExtras } from "@/lib/vault/balanceData";
import { loadBooks } from "@/lib/vault/books";
import { loadDaily } from "@/lib/vault/daily";
import { loadGames } from "@/lib/vault/games";
import { loadHabitDefinitions } from "@/lib/vault/habits";
import { computeGame } from "@/lib/vault/game";
import { toYmd } from "@/lib/vault/habitWindow";
import { datesOfMonth, monthName, monthsWithData } from "@/lib/vault/history";
import { loadMonthNotes } from "@/lib/vault/months";
import { loadSettings } from "@/lib/vault/settings";

export const metadata: Metadata = { title: "Life areas" };

export default function BalancePage() {
  const areas = loadAreas();
  const defs = loadHabitDefinitions();
  const daily = loadDaily(defs.items);
  const achievements = loadAchievements();
  const warnings = [...areas.warnings, ...defs.warnings, ...daily.warnings, ...achievements.warnings];

  const habits = resolveAreas(defs.items, areas.items, "Habit", warnings);
  const earned = resolveAreas(achievements.items, areas.items, "Achievement", warnings);
  // One balance per month that has data, the current month (new tracking starts each month) and all time.
  const extras = balanceExtras(daily.items);
  const run = (window: string[]) => computeBalance(areas.items, habits, daily.items, earned, extras, window);
  const now = defaultWindow(new Date());
  const current = now.days[0].slice(0, 7);
  const months = [...new Set([...monthsWithData(daily.items), current])].sort();
  const periods = [
    { key: "all", label: "All time", balance: run(daily.items.map((d) => d.date)) },
    ...months.map((m) => ({ key: m, label: monthName(m), balance: run(datesOfMonth(m)) })),
  ];

  const showGame = loadSettings().game;
  const game = computeGame(habits, daily.items, areas.items, earned, loadMonthNotes().items, toYmd(new Date()), [...loadBooks().items.filter((b) => b.status === "finished").map((b) => ({ kind: "book" as const, finished: b.finished })), ...loadGames().items.filter((g) => g.status === "finished").map((g) => ({ kind: "game" as const, finished: g.finished }))]);

  return (
    <main data-theme="dashboard" className="mx-auto w-full max-w-4xl px-5 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-14">
      <PageHeader eyebrow="Overview" title="Life areas" stats={showGame ? [`Level ${game.level}`, "XP is never taken away"] : ["Each area of life, one month at a time"]} />

      {showGame && <StatusWindow game={game} />}
      {showGame && <LevelReveal level={game.level} />}
      <div className="h-12" />

      {areas.items.filter((a) => a.active).length === 0 ? (
        <p className="text-ink-dim">No life areas yet. List them in _system/areas.md in your vault.</p>
      ) : (
        <BalanceExplorer periods={periods} initial={current} />
      )}

      <VaultWarnings warnings={warnings} />
    </main>
  );
}
