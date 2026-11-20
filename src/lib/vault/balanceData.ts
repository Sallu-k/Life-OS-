// Gathers everything (besides habits) that feeds the life areas: fun entries from month notes and daily
// notes, finished games, and finished books (from book notes and month notes' "## Books").
import type { BalanceExtras, FunEntry } from "./balance";
import { loadBooks } from "./books";
import { loadGames } from "./games";
import { loadMonthNotes } from "./months";
import type { DailyRecord } from "./types";
import fs from "node:fs";
import path from "node:path";
import { vaultRoot } from "./paths";

// "2026-11-05 Trip to Murudeshwar" -> a dated entry; anything else is an undated entry for the month.
function funEntry(text: string, month: string): FunEntry {
  const m = /^(\d{4}-\d{2}-\d{2})\s*[:\-–]?\s*(.*)$/.exec(text);
  return m ? { date: m[1], month: m[1].slice(0, 7), text: m[2] || text } : { date: null, month, text };
}

export function balanceExtras(records: DailyRecord[]): BalanceExtras {
  const notes = loadMonthNotes().items;
  const fun: FunEntry[] = [
    ...notes.flatMap((n) => n.fun.map((t) => funEntry(t, n.month))),
    ...records.flatMap((r) => r.fun.map((t) => ({ date: r.date, month: r.date.slice(0, 7), text: t }))),
  ];
  const games = loadGames().items.filter((g) => g.status === "finished").map((g) => ({ title: g.title, finished: g.finished }));
  const books = [
    ...loadBooks().items.filter((b) => b.status === "finished").map((b) => ({ title: b.title, finished: b.finished })),
    ...notes.flatMap((n) => n.books.map((t) => ({ title: t, finished: n.month }))),
  ];
  return { fun, games, books, moneyChecks: moneyCheckDates() };
}

// Only the dates of the weekly money checks ("- 2026-11-08: 450" under "## Left" in Finance/YYYY-MM.md).
// The amounts are private and are never read into the site.
function moneyCheckDates(): string[] {
  const dir = path.join(vaultRoot(), "Finance");
  if (!fs.existsSync(dir)) return [];
  const dates: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.md$/.test(x))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const left = /^## Left\s*$([\s\S]*?)(?=^#{1,2}\s|(?![\s\S]))/m.exec(text)?.[1] ?? "";
    for (const m of left.matchAll(/^\s*[-*+]\s+(\d{4}-\d{2}-\d{2}):/gm)) dates.push(m[1]);
  }
  return dates;
}
