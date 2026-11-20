// Typed quick add: reads the details out of what you type, so one line is enough.
//   "Call bank tomorrow 5pm !high"           -> tomorrow, 17:00, high priority
//   "Gym every mon, thu after work nag"       -> repeats Monday/Thursday, at the "After work" anchor, keeps reminding
//   "Submit report by fri 10am"               -> deadline Friday 10:00
//   "Clean room this week" / "Renew card next month" / "Learn Rust someday"
//   "Revise ch 3 in 3 days", "Pay fees 12 nov", "Read paper from mon" (start date)
// Words it does not understand stay in the task's text. Dates are local; "12/11" is 12 November.
import { localToday, shift } from "@/components/today/types";
import { nextMonday, SOMEDAY, weekId } from "./plan";
import { savedSetup, type Anchor } from "./anchors";

export interface Parsed {
  text: string;
  date: string | null; // a day, "week:…", "month:…", "someday"; null = not said
  time: string | null;
  after: string | null;
  priority: "high" | "medium" | "low" | null;
  repeat: string | null;
  deadline: boolean;
  start: string | null;
  nag: boolean;
  found: string[]; // what was understood, for the preview chips
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY = "(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|sday|nesday|rsday|urday)?";
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayIndex = (w: string) => DAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));

// The next date (after today, or today itself when allowed) that is that weekday.
function nextWeekday(today: string, index: number, includeToday: boolean): string {
  const d = new Date(`${today}T12:00:00`);
  let n = (index - d.getDay() + 7) % 7;
  if (n === 0 && !includeToday) n = 7;
  return shift(today, n);
}

// "12 nov", "nov 12", "12/11", "2026-11-12" -> the next such date (this year, or next year if passed).
function dateFrom(m: RegExpExecArray, today: string): string | null {
  const [, iso, d1, mon1, mon2, d2, dd, mm] = m;
  if (iso) return iso;
  const day = Number(d1 ?? d2 ?? dd);
  const month = mon1 || mon2 ? MONTHS.indexOf((mon1 ?? mon2).slice(0, 3)) : Number(mm) - 1;
  if (!(day >= 1 && day <= 31 && month >= 0 && month <= 11)) return null;
  let d = new Date(Number(today.slice(0, 4)), month, day, 12);
  if (ymd(d) < today) d = new Date(d.getFullYear() + 1, month, day, 12);
  return ymd(d);
}

function to24(h: number, min: number, ampm?: string): string | null {
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}

export function quickParse(input: string, today = localToday(), anchors: Anchor[] = savedSetup().anchors): Parsed {
  const out: Parsed = { text: "", date: null, time: null, after: null, priority: null, repeat: null, deadline: false, start: null, nag: false, found: [] };
  let s = ` ${input} `;
  // Each rule: a pattern (whole words) and what it means. The first match of each rule is used.
  const rule = (re: RegExp, use: (m: RegExpExecArray) => string | false | null | void) => {
    const m = re.exec(s);
    if (!m) return;
    const label = use(m);
    if (label === false) return; // not understood: leave the words in the text
    s = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
    if (label) out.found.push(label);
  };
  const DATE = `(\\d{4}-\\d{2}-\\d{2})|(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}|${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})\\/(\\d{1,2})`;
  const whenWord = (w: string): string | null => {
    const x = w.toLowerCase();
    if (x === "today") return today;
    if (/^(tomorrow|tmr|tmrw|tom)$/.test(x)) return shift(today, 1);
    const i = dayIndex(x);
    return i >= 0 && new RegExp(`^${DAY}$`).test(x) ? nextWeekday(today, i, false) : null;
  };

  // Repeats: "every day|weekday|week|month|year", "every 2 weeks", "every mon, thu", "daily", "weekly", "when done".
  rule(/\s(daily|weekly|monthly|yearly)\s/i, (m) => {
    out.repeat = `every ${{ daily: "day", weekly: "week", monthly: "month", yearly: "year" }[m[1].toLowerCase() as "daily"]}`;
    return `🔁 ${out.repeat}`;
  });
  rule(new RegExp(`\\severy\\s+((?:${DAY}[\\s,]*(?:and\\s+)?)+)`, "i"), (m) => {
    const days = [...m[1].toLowerCase().matchAll(new RegExp(DAY, "g"))].map((d) => DAYS[dayIndex(d[0])]);
    out.repeat = `every week on ${days.map((d) => d[0].toUpperCase() + d.slice(1)).join(", ")}`;
    return `🔁 ${out.repeat}`;
  });
  rule(/\severy\s+(?:(\d+)\s+)?(days?|weekdays?|weeks?|months?|years?)\s/i, (m) => {
    const unit = m[2].toLowerCase().replace(/s$/, "");
    const n = Number(m[1] ?? 1);
    out.repeat = unit === "weekday" ? "every weekday" : n > 1 ? `every ${n} ${unit}s` : `every ${unit}`;
    return `🔁 ${out.repeat}`;
  });
  rule(/\swhen done\s/i, () => {
    if (!out.repeat) return false;
    out.repeat += " when done";
    out.found[out.found.length - 1] = `🔁 ${out.repeat}`;
    return null;
  });

  // Start date: "from mon", "start 12 nov".
  rule(new RegExp(`\\s(?:from|start(?:s|ing)?)\\s+(today|tomorrow|tmr|${DAY}|${DATE})\\s`, "i"), (m) => {
    const d = whenWord(m[1]) ?? dateFrom(new RegExp(DATE, "i").exec(m[1])!, today);
    if (!d) return false;
    out.start = d;
    return `🛫 from ${d.slice(5)}`;
  });

  // Deadline: "by fri", "by 12 nov", "due tomorrow".
  rule(new RegExp(`\\s(?:by|due|before)\\s+(today|tomorrow|tmr|tonight|${DAY}|${DATE})\\s`, "i"), (m) => {
    const d = m[1].toLowerCase() === "tonight" ? today : (whenWord(m[1]) ?? dateFrom(new RegExp(DATE, "i").exec(m[1])!, today));
    if (!d) return false;
    out.date = d;
    out.deadline = true;
    return `⚑ due ${d === today ? "today" : d === shift(today, 1) ? "tomorrow" : d.slice(5)}`;
  });
  rule(/\s(⚑|deadline)\s/i, () => ((out.deadline = true), "⚑ deadline"));

  // Places without a day.
  rule(/\s(this week|next week|this month|next month|someday|some day|later)\s/i, (m) => {
    const w = m[1].toLowerCase();
    if (out.date) return false;
    if (w === "this week") out.date = `week:${weekId(today)}`;
    else if (w === "next week") out.date = `week:${weekId(nextMonday(today))}`;
    else if (w === "this month") out.date = `month:${today.slice(0, 7)}`;
    else if (w === "next month") {
      const d = new Date(`${today.slice(0, 7)}-01T12:00:00`);
      d.setMonth(d.getMonth() + 1);
      out.date = `month:${ymd(d).slice(0, 7)}`;
    } else out.date = SOMEDAY;
    return `📅 ${w === "some day" || w === "later" ? "someday" : w}`;
  });

  // Days: "today", "tomorrow", "tonight", "next mon", "on friday", "in 3 days", "12 nov".
  rule(/\s(tonight)\s/i, () => {
    if (out.date) return false;
    out.date = today;
    out.time ??= "20:00";
    return "📅 tonight";
  });
  rule(new RegExp(`\\s(?:on\\s+|next\\s+)?(today|tomorrow|tmrw?|${DAY})\\s`, "i"), (m) => {
    if (out.date) return false;
    out.date = whenWord(m[1]);
    return out.date ? `📅 ${out.date === today ? "today" : out.date === shift(today, 1) ? "tomorrow" : DAYS[new Date(`${out.date}T12:00:00`).getDay()].slice(0, 3)}` : false;
  });
  rule(/\sin\s+(\d{1,3})\s+(days?|weeks?)\s/i, (m) => {
    if (out.date) return false;
    out.date = shift(today, Number(m[1]) * (m[2].startsWith("week") ? 7 : 1));
    return `📅 ${out.date.slice(5)}`;
  });
  rule(new RegExp(`\\s(?:on\\s+)?(?:${DATE})\\s`, "i"), (m) => {
    if (out.date) return false;
    const d = dateFrom(new RegExp(DATE, "i").exec(m[0].trim().replace(/^on\s+/i, ""))!, today);
    if (!d) return false;
    out.date = d;
    return `📅 ${d.slice(5)}`;
  });

  // An anchor from Settings ("Your day"): "after wake up", "after work +10", "before lunch".
  if (anchors.length) {
    const names = anchors.flatMap((a) => [a.label, a.id]).filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    rule(new RegExp(`\\s(after|before)\\s+(${names.join("|")})(?:\\s*([+-]\\s*\\d{1,3}))?\\s`, "i"), (m) => {
      const a = anchors.find((x) => x.label.toLowerCase() === m[2].toLowerCase() || x.id === m[2].toLowerCase());
      if (!a) return false;
      const off = m[3] ? Number(m[3].replace(/\s/g, "")) : m[1].toLowerCase() === "before" ? -15 : 0;
      out.after = `${a.id}${off >= 0 ? "+" : ""}${off}`;
      return `⚓ ${m[1].toLowerCase()} ${a.label}`;
    });
  }

  // Times: "at 5pm", "5:30 pm", "17:00", "noon", "morning", "evening".
  rule(/\s(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?\s/i, (m) => {
    const t = to24(Number(m[1]), Number(m[2]), m[3]?.toLowerCase());
    return t ? ((out.time = t), `⏰ ${t}`) : false;
  });
  rule(/\s(?:at\s+)?(\d{1,2})\s*(am|pm)\s/i, (m) => {
    const t = to24(Number(m[1]), 0, m[2].toLowerCase());
    return t ? ((out.time = t), `⏰ ${t}`) : false;
  });
  rule(/\s(?:at\s+|in the\s+)?(noon|morning|afternoon|evening)\s/i, (m) => {
    out.time = { noon: "12:00", morning: "08:00", afternoon: "14:00", evening: "18:00" }[m[1].toLowerCase() as "noon"];
    return `⏰ ${out.time}`;
  });

  // Priority: "!!!" or "!high" or "p1" high, "!!" / "!med" / "p2" medium, "!low" / "p3" low.
  rule(/\s(!!!|!high|!h|p1)\s/i, () => ((out.priority = "high"), "⏫ high"));
  rule(/\s(!!|!medium|!med|!m|p2)\s/i, () => ((out.priority = "medium"), "🔼 medium"));
  rule(/\s(!low|!l|p3)\s/i, () => ((out.priority = "low"), "🔽 low"));

  rule(/\s(nag|🔔)\s/i, () => ((out.nag = true), "🔔 keeps reminding"));

  out.text = s.replace(/\s+/g, " ").trim();
  return out;
}
