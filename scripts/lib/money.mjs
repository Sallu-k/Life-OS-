// Money without counting every purchase: only money that comes in, and once a week how much is left.
// What a stretch of days cost is worked out, never typed: left before + money in since - left now. Kept in Finance/YYYY-MM.md (private: read live, never built into pages):
//
//   ## Money in
//   - 2026-11-03 Scholarship: 2000
//   ## Left
//   - 2026-11-08: 450
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { backup } from "./days.mjs";
import { readSettings } from "./settings.mjs";
import { getSection, setSection } from "./notes.mjs";
import { vaultRoot } from "./vault-write.mjs";

const isMonth = (m) => /^\d{4}-\d{2}$/.test(m);
const isDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const file = (month) => join(vaultRoot(), "Finance", `${month}.md`);
const amount = (v) => {
  const n = Math.round(Number(v) * 100) / 100;
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new Error("money: amount must be a number from 0 up");
  return n;
};
function prevMonth(month) {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function readNote(month) {
  if (!existsSync(file(month))) return { data: { type: "finance", month }, content: `# Money · ${month}\n\n## Money in\n\n## Left\n` };
  const raw = readFileSync(file(month), "utf8");
  return matter(raw.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)/, (_a, o, y, c) => o + y.replace(/^(\s*[\w-]+:[ \t]*)(\d{4}-\d{2})[ \t]*$/gm, '$1"$2"') + c));
}

// "- 2026-11-03 Scholarship: 2000" and "- 2026-11-08: 450"
export function readMonth(month) {
  if (!isMonth(month)) throw new Error("money: month must look like 2026-11");
  const note = readNote(month);
  const incomes = [];
  for (const line of getSection(note.content, "Money in").split(/\r?\n/)) {
    const m = /^\s*[-*+]\s+(\d{4}-\d{2}-\d{2})\s+(.*?):\s*([\d.,]+)\s*$/.exec(line);
    if (m) incomes.push({ date: m[1], label: m[2].trim(), amount: Number(m[3].replace(/,/g, "")) });
  }
  const checks = [];
  for (const line of getSection(note.content, "Left").split(/\r?\n/)) {
    const m = /^\s*[-*+]\s+(\d{4}-\d{2}-\d{2}):\s*([\d.,]+)\s*$/.exec(line);
    if (m) checks.push({ date: m[1], left: Number(m[2].replace(/,/g, "")) });
  }
  const byDate = (a, b) => a.date.localeCompare(b.date);
  return { incomes: incomes.sort(byDate), checks: checks.sort(byDate) };
}

// A month: money in, the checks, and what each stretch between two checks cost (last month's checks count,
// so the first check of a month still gets a cost).
export function getMoney(month) {
  const now = readMonth(month);
  const before = readMonth(prevMonth(month));
  const incomes = [...before.incomes, ...now.incomes];
  const checks = [...before.checks, ...now.checks];
  const periods = [];
  for (let i = 1; i < checks.length; i++) {
    const [a, b] = [checks[i - 1], checks[i]];
    if (b.date < `${month}-01`) continue;
    const came = incomes.filter((x) => x.date > a.date && x.date <= b.date).reduce((s, x) => s + x.amount, 0);
    periods.push({ from: a.date, to: b.date, cost: Math.round((a.left + came - b.left) * 100) / 100, came });
  }
  return {
    month,
    incomes: now.incomes,
    checks: now.checks,
    totalIn: Math.round(now.incomes.reduce((s, x) => s + x.amount, 0) * 100) / 100,
    lastCheck: checks.at(-1) ?? null,
    periods,
    currency: readSettings().money.currency,
  };
}

function write(month, { incomes, checks }) {
  const note = readNote(month);
  note.content = setSection(note.content, "Money in", incomes.map((x) => `- ${x.date} ${x.label}: ${x.amount}`).join("\n"));
  note.content = setSection(note.content, "Left", checks.map((x) => `- ${x.date}: ${x.left}`).join("\n"));
  backup(file(month));
  mkdirSync(dirname(file(month)), { recursive: true });
  writeFileSync(file(month), matter.stringify(`\n${note.content.replace(/^\s+/, "")}`, { ...note.data, type: "finance", month }));
}

// Adds one entry: { kind: "in", date, label, amount } or { kind: "left", date, left } (one check per day).
export function addMoney(entry) {
  if (!isDate(entry?.date)) throw new Error("money: date must be YYYY-MM-DD");
  const month = entry.date.slice(0, 7);
  const m = readMonth(month);
  if (entry.kind === "in") {
    const label = String(entry.label ?? "").replace(/[:\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Money in";
    m.incomes.push({ date: entry.date, label, amount: amount(entry.amount) });
  } else if (entry.kind === "left") {
    m.checks = [...m.checks.filter((x) => x.date !== entry.date), { date: entry.date, left: amount(entry.left) }];
  } else throw new Error('money: kind must be "in" or "left"');
  const byDate = (a, b) => a.date.localeCompare(b.date);
  write(month, { incomes: m.incomes.sort(byDate), checks: m.checks.sort(byDate) });
  return getMoney(month);
}

// Removes one entry (the owner tapped ✕): { kind, date, index } where index counts within that kind and date.
export function removeMoney({ kind, date, index = 0 }) {
  if (!isDate(date)) throw new Error("money: date must be YYYY-MM-DD");
  const month = date.slice(0, 7);
  const m = readMonth(month);
  const list = kind === "in" ? m.incomes : m.checks;
  const same = list.filter((x) => x.date === date);
  const gone = same[Number(index)];
  if (!gone) throw new Error("money: entry not found");
  const keep = list.filter((x) => x !== gone);
  write(month, kind === "in" ? { incomes: keep, checks: m.checks } : { incomes: m.incomes, checks: keep });
  return getMoney(month);
}
