import { parseFun } from "@/lib/fun";
import type { Achievement, Area, DailyRecord, HabitDefinition, HabitState } from "./types";
import { toYmd } from "./habitWindow";
import { scoreOf } from "./score";

// Areas that also take signals from other data (not only habits).
export const READING_AREA = "knowledge"; // pages read (daily) and books finished
export const FUN_AREA = "fun"; // trips, outings, games
export const FINANCE_AREA = "finance"; // weeks the money check was done (never amounts)
export const MIN_DAYS = 7; // an area needs this many recorded days in the window, or it shows "not enough data"

// One thing that went into an area's number, shown on the Life areas page so the number can be checked.
export interface AreaPart {
  label: string;
  value: number | null; // 0 to 1
  detail: string; // e.g. "26 days" or "3 of 4 weeks"
}

export interface AreaBalance {
  area: Area;
  // The mean of the parts' values (0 to 1), or null when there is not enough data. Null is never drawn as zero.
  value: number | null;
  reason: string | null; // why value is null, e.g. "not enough data (4 days)"
  parts: AreaPart[];
  habits: HabitDefinition[]; // the area's habits that count in this window
  achievements: Achievement[];
  items: { label: string; text: string }[]; // books finished, fun entries, games (listed, also counted where noted)
}

// Things besides habits that can feed an area.
export interface FunEntry {
  date: string | null; // YYYY-MM-DD when written with a date
  month: string; // YYYY-MM it belongs to
  text: string;
}
export interface BalanceExtras {
  fun: FunEntry[];
  games: { title: string; finished: string | null }[]; // finished = YYYY-MM
  books: { title: string; finished: string | null }[];
  moneyChecks: string[]; // dates of the weekly "how much is left" checks (Finance/YYYY-MM.md); amounts never leave the server
}

// Habits and achievements that name an area we do not know are treated as having no area, with a warning.
export function resolveAreas<T extends { area: string | null }>(items: T[], areas: Area[], what: string, warnings: string[]): T[] {
  const known = new Set(areas.map((a) => a.id));
  return items.map((item) => {
    if (item.area === null || known.has(item.area)) return item;
    const name = (item as { id?: string; slug?: string }).id ?? (item as { slug?: string }).slug ?? "?";
    warnings.push(`${what} "${name}": unknown area "${item.area}"; treated as no area`);
    return { ...item, area: null };
  });
}

// Reading as a habit-like mark from pages read: 10+ pages done, 1-9 half, 0 not done, no number = no entry.
function readingMark(pages: number | null): HabitState {
  if (pages === null) return "unrecorded";
  if (pages >= 10) return "done";
  if (pages > 0) return "half";
  return "missed";
}

// The Monday of the week a date falls in, used to count weeks.
function weekOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

const pctDays = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

// One entry per active area for a window of days (a month, or all time).
// Each habit is scored on its own first (done 1, half 0.5, showed up 0.25, not done 0; not applicable and
// no entry left out), then the area is the plain average of its parts, so an area with nine habits and one
// with a single habit are measured the same way. Fewer than MIN_DAYS recorded days -> not enough data.
export function computeBalance(
  areas: Area[],
  habits: HabitDefinition[],
  records: DailyRecord[],
  achievements: Achievement[],
  extras: BalanceExtras,
  window: string[],
): AreaBalance[] {
  const inWindow = new Set(window);
  const days = records.filter((r) => inWindow.has(r.date));
  const months = new Set(window.map((d) => d.slice(0, 7)));
  const until = window[window.length - 1] ?? "";
  const since = window.length > 31 ? window[0] : shiftDays(until, -89);
  const weeks = new Set(window.map(weekOf));

  return areas
    .filter((a) => a.active)
    .map((area) => {
      const own = habits.filter((h) => h.area === area.id && days.some((d) => d.habits[h.id] !== undefined && d.habits[h.id] !== "na"));
      const parts: AreaPart[] = [];
      const recordedDays = new Set<string>();

      for (const h of own) {
        const { value, days: counted } = scoreOf(days.map((d) => d.habits[h.id] ?? "unrecorded"));
        if (value === null) continue;
        parts.push({ label: h.label, value, detail: pctDays(counted) });
        for (const d of days) if (d.habits[h.id] && d.habits[h.id] !== "na") recordedDays.add(d.date);
      }

      const items: { label: string; text: string }[] = [];
      if (area.id === READING_AREA) {
        const { value, days: counted } = scoreOf(days.map((d) => readingMark(d.pages)));
        if (value !== null) {
          parts.push({ label: "Reading (pages)", value, detail: pctDays(counted) });
          for (const d of days) if (d.pages !== null) recordedDays.add(d.date);
        }
        for (const b of extras.books) if (b.finished && months.has(b.finished)) items.push({ label: "Book finished", text: b.title });
      }

      let funWeeks = 0;
      if (area.id === FUN_AREA) {
        const hit = new Set<string>();
        let undated = 0;
        for (const f of extras.fun) {
          if (f.date && inWindow.has(f.date)) hit.add(weekOf(f.date));
          else if (!f.date && months.has(f.month)) undated++;
          else continue;
          const { kind, text } = parseFun(f.text);
          items.push({ label: kind.group === "Gaming" ? `${kind.label} game` : kind.label === "Other" ? "Fun" : kind.label, text: text || f.text });
        }
        for (const g of extras.games) {
          if (g.finished && months.has(g.finished)) {
            undated++;
            items.push({ label: "Game finished", text: g.title });
          }
        }
        funWeeks = Math.min(weeks.size, hit.size + undated);
        if (weeks.size >= 2 && items.length > 0) parts.push({ label: "Weeks with fun", value: funWeeks / weeks.size, detail: `${funWeeks} of ${weeks.size} weeks` });
      }

      // Finance: the share of weeks with a money check (only once there are checks at all).
      if (area.id === FINANCE_AREA && extras.moneyChecks.length > 0 && weeks.size >= 2) {
        const checked = new Set(extras.moneyChecks.filter((d) => inWindow.has(d)).map(weekOf));
        parts.push({ label: "Weeks with a money check", value: checked.size / weeks.size, detail: `${checked.size} of ${weeks.size} weeks` });
        for (const d of extras.moneyChecks) if (inWindow.has(d)) recordedDays.add(d);
      }

      // Fun only counts once something fun was written down in the period; until then it is "no data", not 0%.
      const enough =
        area.id === FUN_AREA ? weeks.size >= 2 && items.length > 0
        : area.id === FINANCE_AREA && extras.moneyChecks.length > 0 ? weeks.size >= 2
        : recordedDays.size >= MIN_DAYS;
      const value = enough && parts.length > 0 ? parts.reduce((sum, p) => sum + (p.value ?? 0), 0) / parts.length : null;
      const reason =
        value !== null
          ? null
          : area.id === FUN_AREA
            ? items.length === 0
              ? "no fun entries yet"
              : "not enough data"
            : parts.length === 0
              ? "no data"
              : `not enough data (${recordedDays.size} ${recordedDays.size === 1 ? "day" : "days"})`;

      return {
        area,
        value,
        reason,
        parts,
        habits: own,
        achievements: achievements.filter((x) => x.area === area.id && x.date >= since && x.date <= until),
        items,
      };
    });
}

// "2026-10-11" moved by n days.
function shiftDays(ymd: string, n: number): string {
  if (!ymd) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  return toYmd(new Date(y, m - 1, d + n));
}

// The window used when nothing is picked: the current calendar month (new tracking starts each month).
export function defaultWindow(today: Date): { label: string; days: string[] } {
  const ym = toYmd(today).slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { label, days };
}
