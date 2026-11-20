// Repeat rules as the notes keep them (same grammar as scripts/lib/tasks.mjs):
// "every [N] day(s)|week(s)|month(s)|year(s)", "every weekday", "every week on Monday, Friday",
// then optionally " when done" and " until YYYY-MM-DD".
export interface Repeat {
  n: number;
  unit: "day" | "weekday" | "week" | "month" | "year";
  days: number[]; // 0 = Sunday … 6 = Saturday (weekly only)
  whenDone: boolean;
  until: string | null;
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function parseRepeat(text: string | null | undefined): Repeat | null {
  const m = /^every\s+(?:(\d+)\s+)?(day|days|weekday|week|weeks|month|months|year|years)(?:\s+on\s+([a-z,\s]+?))?(\s+when done)?(?:\s+until\s+(\d{4}-\d{2}-\d{2}))?$/.exec(String(text ?? "").trim().toLowerCase());
  if (!m) return null;
  const unit = (m[2] === "weekday" ? "weekday" : m[2].replace(/s$/, "")) as Repeat["unit"];
  const days = unit === "week" && m[3] ? [...new Set(m[3].split(/[,\s]+/).map((d) => WEEKDAYS.findIndex((x) => x.toLowerCase().startsWith(d.slice(0, 3)))).filter((i) => i >= 0))].sort() : [];
  return { n: Math.max(1, Number(m[1] ?? 1)), unit, days, whenDone: Boolean(m[4]), until: m[5] ?? null };
}

export function repeatText(r: Repeat | null): string | null {
  if (!r) return null;
  const base = r.unit === "weekday" ? "every weekday" : r.n === 1 ? `every ${r.unit}` : `every ${r.n} ${r.unit}s`;
  const on = r.unit === "week" && r.days.length ? ` on ${r.days.map((i) => WEEKDAYS[i]).join(", ")}` : "";
  return `${base}${on}${r.whenDone ? " when done" : ""}${r.until ? ` until ${r.until}` : ""}`;
}

// Short words for the lists: "Daily", "Mon, Thu", "Every 4 weeks after done".
export function repeatLabel(text: string | null | undefined): string {
  const r = parseRepeat(text);
  if (!r) return "";
  let s =
    r.unit === "weekday" ? "Weekdays"
    : r.unit === "week" && r.days.length ? `${r.n > 1 ? `Every ${r.n} weeks: ` : ""}${r.days.map((i) => WEEKDAYS[i].slice(0, 3)).join(", ")}`
    : r.n === 1 ? { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[r.unit]
    : `Every ${r.n} ${r.unit}s`;
  if (r.whenDone) s += " after done";
  if (r.until) s += ` until ${r.until.slice(5)}`;
  return s;
}

// The first day a new repeating task should be on when no day was given: the next chosen weekday
// (today counts), otherwise today.
export function firstDay(r: Repeat | null, today: string): string {
  if (!r || r.unit !== "week" || !r.days.length) return today;
  const d = new Date(`${today}T12:00:00`);
  for (let i = 0; i < 7; i++) {
    if (r.days.includes(d.getDay())) break;
    d.setDate(d.getDate() + 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
