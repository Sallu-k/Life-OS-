// PC time per app (Logs/PC/YYYY-MM.md, written by the LifeOS server from StayFree, scripts/lib/pclog.mjs):
//   - 2026-11-20 late=54 | Brave Browser=128 | VALORANT=64
// Read when the site is built, for the Insights page. Only app names and minutes.
import fs from "node:fs";
import path from "node:path";
import type { Finding } from "./insights";
import { vaultRoot } from "./paths";
import type { DailyRecord } from "./types";

export interface PcDay {
  date: string;
  apps: Record<string, number>; // minutes
  late: number; // minutes after the night lock
}

const LINE = /^- (\d{4}-\d{2}-\d{2}) late=(\d+)((?: \| [^|=]+=\d+)*)$/; // as scripts/lib/pclog.mjs

export function loadPc(): PcDay[] {
  const dir = path.join(vaultRoot(), "Logs", "PC");
  if (!fs.existsSync(dir)) return [];
  const out: PcDay[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.md$/.test(f)).sort())
    for (const raw of fs.readFileSync(path.join(dir, file), "utf8").split(/\r?\n/)) {
      const m = LINE.exec(raw.trim());
      if (!m) continue;
      const apps: Record<string, number> = {};
      for (const part of m[3].split(" | ").slice(1)) {
        const i = part.lastIndexOf("=");
        apps[part.slice(0, i).trim()] = Number(part.slice(i + 1));
      }
      out.push({ date: m[1], apps, late: Number(m[2]) });
    }
  return out;
}

function ago(today: string, n: number) {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const hours = (min: number) => `${(min / 60).toFixed(1)} h`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// What StayFree's numbers say: where the PC time goes, how late it runs, and sleep after late nights.
export function pcFindings(days: PcDay[], records: DailyRecord[], today: string): Finding[] {
  const out: Finding[] = [];
  const recent = days.filter((d) => d.date > ago(today, 30) && d.date <= today);
  if (recent.length >= 7) {
    const apps: Record<string, number> = {};
    for (const d of recent) for (const [a, m] of Object.entries(d.apps)) apps[a] = (apps[a] ?? 0) + m;
    const total = Object.values(apps).reduce((s, m) => s + m, 0);
    const top = Object.entries(apps)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    out.push({
      title: `${hours(total / recent.length)} a day on the PC lately; ${top[0][0]} is the biggest.`,
      detail: top.map(([a, m]) => `${a} ${hours(m / recent.length)}`).join(" · ") + " (a day, last 30 days).",
      days: recent.length,
      tone: "neutral",
    });
  }
  // After the night lock: the last 14 days against the 14 before (numbers may go down, or up).
  const last = days.filter((d) => d.date > ago(today, 14) && d.date <= today);
  const before = days.filter((d) => d.date > ago(today, 28) && d.date <= ago(today, 14));
  if (last.length >= 7 && before.length >= 7) {
    const now = avg(last.map((d) => d.late));
    const then = avg(before.map((d) => d.late));
    const better = now < then - 5;
    const worse = now > then + 5;
    out.push({
      title: better ? `Later nights on the PC are shrinking: ${Math.round(now)} min a night after the night lock.` : worse ? `More PC after the night lock lately: ${Math.round(now)} min a night.` : `About ${Math.round(now)} min a night on the PC after the night lock.`,
      detail: `Last 14 days ${Math.round(now)} min a night, the 14 before ${Math.round(then)} min.`,
      days: last.length + before.length,
      tone: better ? "good" : worse ? "care" : "neutral",
    });
  }
  // Sleep after a late PC night (30 min or more after the night lock) against nights without.
  const sleepOf = new Map(records.filter((r) => r.sleep !== null).map((r) => [r.date, r.sleep as number]));
  const next = (date: string) => sleepOf.get(ago(date, -1)) ?? sleepOf.get(date); // sleep is logged on the morning's note or the evening's
  const lateNights = days.map((d) => ({ late: d.late >= 30, sleep: next(d.date) })).filter((x) => x.sleep !== undefined);
  const withLate = lateNights.filter((x) => x.late).map((x) => x.sleep as number);
  const without = lateNights.filter((x) => !x.late).map((x) => x.sleep as number);
  if (withLate.length >= 8 && without.length >= 8) {
    const diff = avg(without) - avg(withLate);
    if (Math.abs(diff) >= 0.25)
      out.push({
        title: diff > 0 ? `After a late night on the PC you sleep about ${diff.toFixed(1)} h less.` : `Late PC nights have not cost you sleep so far.`,
        detail: `Sleep after 30+ min on the PC past the night lock: ${avg(withLate).toFixed(1)} h; other nights: ${avg(without).toFixed(1)} h.`,
        days: withLate.length + without.length,
        tone: diff > 0 ? "care" : "good",
      });
  }
  return out;
}
