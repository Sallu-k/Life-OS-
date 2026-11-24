// Patterns in the daily record, for the Insights page. Only numbers and habit marks are used (never
// journal text). Every finding says how many days it rests on, and weak ones are left out: these are
// patterns that go together, not proof that one causes the other.
import { scoreOf } from "./score";
import type { DailyRecord, HabitDefinition, HabitState } from "./types";

export interface Finding {
  title: string; // one plain sentence
  detail: string; // the numbers behind it
  days: number; // how many days it rests on
  tone: "good" | "care" | "neutral";
}

const GOOD = new Set<HabitState>(["done", "half"]);
const NOT_GOOD = new Set<HabitState>(["missed", "partial"]);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const MIN_GROUP = 8; // each side of a comparison needs at least this many days

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// A day's overall habit score (done 1, half 0.5, showed up 0.25, not done 0).
export const dayScore = (r: DailyRecord) => scoreOf(Object.values(r.habits)).value;

// Compare the average of `value` on days split by `split` (above vs at/below its median).
function splitCompare(records: DailyRecord[], split: (r: DailyRecord) => number | null, value: (r: DailyRecord) => number | null) {
  const pairs = records.map((r) => [split(r), value(r)] as const).filter(([a, b]) => a !== null && b !== null) as [number, number][];
  const m = median(pairs.map(([a]) => a));
  if (m === null) return null;
  const high = pairs.filter(([a]) => a > m).map(([, b]) => b);
  const low = pairs.filter(([a]) => a <= m).map(([, b]) => b);
  if (high.length < MIN_GROUP || low.length < MIN_GROUP) return null;
  return { median: m, high: avg(high)!, low: avg(low)!, days: pairs.length };
}

// Minutes past `target` around midnight ("23:10" vs "23:00" -> 10; "00:30" -> 90).
function minutesAfter(time: string, target: string): number {
  const m = (t: string) => {
    const [h, mm] = t.split(":").map(Number);
    return (h < 12 ? h + 24 : h) * 60 + mm;
  };
  return m(time) - m(target);
}

// Early nights (bedtime by the target) against late ones: how the next day went.
function earlyNights(records: DailyRecord[], habits: HabitDefinition[], sleepBy: string): Finding[] {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const next = (date: string) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return byDate.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };
  const nights = records.filter((r) => r.bedtime !== null).map((r) => ({ early: minutesAfter(r.bedtime!, sleepBy) <= 0, after: next(r.date) }));
  if (nights.length === 0) return [];
  const early = nights.filter((n) => n.early);
  const late = nights.filter((n) => !n.early);
  const recent = nights.slice(-14);
  const out: Finding[] = [
    {
      title: `${recent.filter((n) => n.early).length} of your last ${recent.length} measured nights were early (by ${sleepBy}).`,
      detail: `Bedtimes come from the phone's screen going off for the night.`,
      days: recent.length,
      tone: "neutral",
    },
  ];
  const MIN = 5; // each side, so a comparison shows from the first weeks on
  const compare = (name: string, value: (r: DailyRecord) => number | null, show: (v: number) => string) => {
    const a = early.map((n) => (n.after ? value(n.after) : null)).filter((v): v is number => v !== null);
    const b = late.map((n) => (n.after ? value(n.after) : null)).filter((v): v is number => v !== null);
    if (a.length < MIN || b.length < MIN) return;
    const better = avg(a)! > avg(b)!;
    out.push({ title: `After an early night, ${name} is ${better ? "higher" : "not higher"}.`, detail: `${show(avg(a)!)} after early nights, ${show(avg(b)!)} after late ones.`, days: a.length + b.length, tone: better ? "good" : "neutral" });
  };
  compare("productivity", (r) => r.productivity, (v) => `${Math.round(v)}%`);
  compare("mood", (r) => r.mood, (v) => `${v.toFixed(1)} of 5`);
  compare("reading", (r) => r.pages, (v) => `${Math.round(v)} pages`);
  return out;
}

// Pages per week: the last 4 weeks against the 8 before them.
function readingTrend(records: DailyRecord[], today: string): Finding[] {
  const ago = (n: number) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const sum = (from: string, to: string) => records.filter((r) => r.date > from && r.date <= to).reduce((s, r) => s + (r.pages ?? 0), 0);
  const recent = sum(ago(28), today) / 4;
  const before = sum(ago(84), ago(28)) / 8;
  if (recent === 0 && before === 0) return [];
  return [
    {
      title: recent >= before ? `You are reading more: ${Math.round(recent)} pages a week lately.` : `Reading has slowed to ${Math.round(recent)} pages a week.`,
      detail: `Last 4 weeks: ${Math.round(recent)} pages a week; the 8 weeks before: ${Math.round(before)}.`,
      days: 84,
      tone: recent >= before ? "good" : "care",
    },
  ];
}

// Protein over the last 30 days (Today's Food tab totals): days logged, the average, days at the target.
// Shown once there are 5 logged days; only the daily totals are read, never which foods.
export function proteinFinding(records: DailyRecord[], target: number, today: string): Finding[] {
  const from = new Date(`${today}T12:00:00`);
  from.setDate(from.getDate() - 30);
  const since = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
  const days = records.filter((r) => r.date > since && r.date <= today && r.protein !== null).map((r) => r.protein!);
  if (days.length < 5) return [];
  const reached = days.filter((g) => g >= target).length;
  const mean = Math.round(avg(days)!);
  return [
    {
      title: `Protein: ${mean} g a day on average, the target (${target} g) reached on ${reached} of ${days.length} logged days.`,
      detail: `Last 30 days, from the Food tab's totals. Values are estimates per home portion.`,
      days: days.length,
      tone: reached * 2 >= days.length ? "good" : "care",
    },
  ];
}

export function findInsights(records: DailyRecord[], habits: HabitDefinition[], sleepBy = "23:00", today = new Date().toISOString().slice(0, 10)): Finding[] {
  const out: Finding[] = [...earlyNights(records, habits, sleepBy), ...readingTrend(records, today)];
  const label = (id: string) => habits.find((h) => h.id === id)?.label ?? id;

  // 1. Screen time and productivity.
  const sp = splitCompare(records, (r) => r.screenTime, (r) => r.productivity);
  if (sp && Math.abs(sp.high - sp.low) >= 5) {
    const less = sp.high < sp.low;
    out.push({
      title: less ? `More screen time goes with less productive days.` : `More screen time has gone with more productive days.`,
      detail: `Above ${sp.median} h of screen time: productivity ${Math.round(sp.high)}% on average; at or below it: ${Math.round(sp.low)}%.`,
      days: sp.days,
      tone: less ? "care" : "neutral",
    });
  }

  // 2. Sleep with productivity and mood.
  const sl = splitCompare(records, (r) => r.sleep, (r) => r.productivity);
  if (sl && Math.abs(sl.high - sl.low) >= 5)
    out.push({
      title: sl.high > sl.low ? `Longer sleep goes with more productive days.` : `Longer sleep has not meant more productive days.`,
      detail: `Over ${sl.median} h of sleep: productivity ${Math.round(sl.high)}%; ${sl.median} h or less: ${Math.round(sl.low)}%.`,
      days: sl.days,
      tone: sl.high > sl.low ? "good" : "neutral",
    });
  const sm = splitCompare(records, (r) => r.sleep, (r) => r.mood);
  if (sm && Math.abs(sm.high - sm.low) >= 0.4)
    out.push({
      title: sm.high > sm.low ? `You feel better after more sleep.` : `More sleep has not lifted your mood.`,
      detail: `Mood ${sm.high.toFixed(1)} of 5 after more than ${sm.median} h, ${sm.low.toFixed(1)} after ${sm.median} h or less.`,
      days: sm.days,
      tone: sm.high > sm.low ? "good" : "neutral",
    });

  // 3. Habits that go together: when A is done, how often is B done (vs when A is not)?
  // Days where every habit is "not done" are left out here: they are usually days nothing was really
  // tracked, and they would make every pair of habits look linked.
  const ids = habits.filter((h) => h.active).map((h) => h.id);
  const tracked = records.filter((r) => Object.values(r.habits).some((s) => s !== "missed" && s !== "unrecorded" && s !== "na"));
  const pairs: (Finding & { lift: number; key: string })[] = [];
  for (const a of ids)
    for (const b of ids) {
      if (a === b) continue;
      const withA = tracked.filter((r) => GOOD.has(r.habits[a]) && r.habits[b] && r.habits[b] !== "na" && r.habits[b] !== "unrecorded");
      const withoutA = tracked.filter((r) => NOT_GOOD.has(r.habits[a]) && r.habits[b] && r.habits[b] !== "na" && r.habits[b] !== "unrecorded");
      if (withA.length < MIN_GROUP * 2 || withoutA.length < MIN_GROUP) continue;
      const p1 = withA.filter((r) => GOOD.has(r.habits[b])).length / withA.length;
      const p0 = withoutA.filter((r) => GOOD.has(r.habits[b])).length / withoutA.length;
      if (p1 - p0 >= 0.25)
        pairs.push({
          key: [a, b].sort().join("+"),
          title: `${label(a)} pulls ${label(b)} along.`,
          detail: `On days ${label(a)} is done, ${label(b)} is done ${pct(p1)} of the time; when it is not, ${pct(p0)}.`,
          days: withA.length + withoutA.length,
          tone: "good",
          lift: p1 - p0,
        });
    }
  pairs.sort((x, y) => y.lift - x.lift);
  const leaders = new Set<string>();
  const shownPairs = new Set<string>();
  for (const p of pairs) {
    const leader = p.title.split(" pulls ")[0];
    // One finding per leading habit and per pair (A→B and B→A say the same thing), at most 4.
    if (leaders.has(leader) || shownPairs.has(p.key) || leaders.size >= 4) continue;
    leaders.add(leader);
    shownPairs.add(p.key);
    out.push({ title: p.title, detail: p.detail, days: p.days, tone: p.tone });
  }

  // 4. Habits that go with productive days.
  const hp: (Finding & { diff: number })[] = [];
  for (const id of ids) {
    const done = records.filter((r) => GOOD.has(r.habits[id]) && r.productivity !== null).map((r) => r.productivity!);
    const not = records.filter((r) => NOT_GOOD.has(r.habits[id]) && r.productivity !== null).map((r) => r.productivity!);
    if (done.length < MIN_GROUP || not.length < MIN_GROUP) continue;
    const diff = avg(done)! - avg(not)!;
    if (diff >= 8) hp.push({ title: `Days with ${label(id)} are more productive.`, detail: `Productivity ${Math.round(avg(done)!)}% when done, ${Math.round(avg(not)!)}% when not.`, days: done.length + not.length, tone: "good", diff });
  }
  hp.sort((x, y) => y.diff - x.diff);
  for (const f of hp.slice(0, 3)) out.push({ title: f.title, detail: f.detail, days: f.days, tone: f.tone });

  // 5. Best and hardest weekday (by the day's habit score).
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const byDay = names.map(() => [] as number[]);
  for (const r of records) {
    const s = dayScore(r);
    if (s !== null) byDay[new Date(`${r.date}T12:00:00`).getDay()].push(s);
  }
  const means = byDay.map((xs, i) => ({ i, m: avg(xs), n: xs.length })).filter((x) => x.m !== null && x.n >= MIN_GROUP) as { i: number; m: number; n: number }[];
  if (means.length >= 5) {
    const best = means.reduce((a, b) => (b.m > a.m ? b : a));
    const worst = means.reduce((a, b) => (b.m < a.m ? b : a));
    if (best.m - worst.m >= 0.05)
      out.push({
        title: `${names[best.i]} is your strongest day; ${names[worst.i]} the hardest.`,
        detail: `Habits done: ${pct(best.m)} on ${names[best.i]}s, ${pct(worst.m)} on ${names[worst.i]}s.`,
        days: means.reduce((s, x) => s + x.n, 0),
        tone: "neutral",
      });
  }

  // 6. Why habits slip (the reasons tapped on Today).
  const reasons = new Map<string, number>();
  let tagged = 0;
  for (const r of records)
    for (const why of Object.values(r.missed)) {
      reasons.set(why, (reasons.get(why) ?? 0) + 1);
      tagged++;
    }
  if (tagged >= 5) {
    const top = [...reasons].sort((a, b) => b[1] - a[1]);
    out.push({
      title: `Most misses are "${top[0][0]}".`,
      detail: top.map(([w, n]) => `${w} ${n}`).join(" · "),
      days: tagged,
      tone: "care",
    });
  }
  return out;
}

// The year as one square per day, coloured by the day's habit score (null = nothing logged).
export function yearSquares(records: DailyRecord[], year: number): { date: string; score: number | null; mood: number | null }[] {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const out: { date: string; score: number | null; mood: number | null }[] = [];
  for (let d = new Date(year, 0, 1, 12); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    const date = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const r = byDate.get(date);
    out.push({ date, score: r ? dayScore(r) : null, mood: r?.mood ?? null });
  }
  return out;
}

// "On this day": the keep lines written on today's date in earlier years.
export function onThisDay(records: DailyRecord[], today: string): { date: string; years: number; lines: string[] }[] {
  const md = today.slice(5);
  const year = Number(today.slice(0, 4));
  return records
    .filter((r) => r.date.slice(5) === md && r.date < today && r.keepLines.length > 0)
    .map((r) => ({ date: r.date, years: year - Number(r.date.slice(0, 4)), lines: r.keepLines }))
    .sort((a, b) => a.years - b.years);
}
