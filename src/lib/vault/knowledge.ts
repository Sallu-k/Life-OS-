// The knowledge log (Logs/Knowledge/YYYY-MM.md, written by the LifeOS server, scripts/lib/knowledge.mjs):
// one line per card read or recalled and per passage read. Read when the site is built, for Insights:
// counts only, never card or passage text (that stays live, on the Knowledge page).
//   - 2026-11-21 14:03 knew science/entropy
import fs from "node:fs";
import path from "node:path";
import type { Finding } from "./insights";
import { vaultRoot } from "./paths";

// Same line format as scripts/lib/knowledge.mjs (LINE).
const LINE = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) (read|knew|notyet|passage|current) [a-z0-9][a-z0-9/:._-]{0,160}$/;

function ago(today: string, n: number) {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function knowledgeFindings(today: string): Finding[] {
  const dir = path.join(vaultRoot(), "Logs", "Knowledge");
  if (!fs.existsSync(dir)) return [];
  const since = ago(today, 30);
  const events: { date: string; kind: string }[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.md$/.test(f)))
    for (const raw of fs.readFileSync(path.join(dir, file), "utf8").split(/\r?\n/)) {
      const m = LINE.exec(raw.trim());
      if (m && m[1] > since) events.push({ date: m[1], kind: m[3] });
    }
  const n = (kind: string) => events.filter((e) => e.kind === kind).length;
  const days = new Set(events.filter((e) => e.kind !== "current").map((e) => e.date)).size;
  if (days < 3) return [];
  const asked = n("knew") + n("notyet");
  return [
    {
      title: `You read something worth knowing on ${days} of the last 30 days.`,
      detail: `${n("read") + asked} cards · ${n("passage")} passages${asked ? ` · recalled ${n("knew")} of ${asked} (${Math.round((n("knew") / asked) * 100)}%)` : ""}.`,
      days,
      tone: days >= 15 ? "good" : "neutral",
    },
  ];
}
