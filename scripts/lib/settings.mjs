// Owner settings kept in the vault at _system/settings.md (frontmatter), editable in Obsidian too.
//   game: true | false     show the game layer (XP, levels, streaks, reviews). Default true.
//   day: { anchors: [{ id, label, time }], calendar, calendarOffset }
//                          named times habits and tasks can follow, and an optional second calendar.
//   sleep: { by: "23:00", habit, windDown }
//                          the bedtime target; the habit the phone ticks from measured bedtime; the habit
//                          reminded an hour before bed ("wind down").
//   rewards: { label: "Reward time", night: 30, earn: { <habit id>: minutes }, cap: 420 }
//                          minutes earned by an early night and by chosen habits, and the most banked.
//   money: { currency: "EUR" }   currency code for the money card (empty: plain numbers).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { backup } from "./days.mjs";
import { slugify, vaultRoot } from "./vault-write.mjs";

const file = () => join(vaultRoot(), "_system", "settings.md");
const id = (v, d) => (typeof v === "string" && /^[a-z0-9-]{1,60}$/.test(v) ? v : d);
const isTime = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const CALENDARS = ["islamic-umalqura", "islamic-civil", "hebrew", "chinese", "persian", "indian", "buddhist", "ethiopic", "coptic", "japanese"];

function cleanDay(d) {
  const x = d && typeof d === "object" ? d : {};
  const seen = new Set();
  const anchors = (Array.isArray(x.anchors) ? x.anchors : [])
    .map((a) => ({ id: id(a?.id, null) ?? slugify(String(a?.label ?? "")), label: String(a?.label ?? "").trim().slice(0, 40), time: isTime(a?.time) ? a.time : null }))
    .filter((a) => a.id && a.label && a.time && !seen.has(a.id) && seen.add(a.id))
    .slice(0, 12);
  const offset = Number(x.calendarOffset);
  return { anchors, calendar: CALENDARS.includes(x.calendar) ? x.calendar : null, calendarOffset: Number.isInteger(offset) ? Math.max(-2, Math.min(2, offset)) : 0 };
}
function cleanSleep(s) {
  const x = s && typeof s === "object" ? s : {};
  return { by: isTime(x.by) ? x.by : "23:00", habit: id(x.habit, null), windDown: id(x.windDown, null) };
}
function cleanRewards(r) {
  const x = r && typeof r === "object" ? r : {};
  const n = (v, d, hi) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= hi ? Number(v) : d);
  const earn = Object.fromEntries(
    Object.entries(x.earn && typeof x.earn === "object" ? x.earn : {})
      .filter(([k]) => id(k, null))
      .map(([k, v]) => [k, n(v, 0, 240)])
      .filter(([, v]) => v > 0),
  );
  return { label: String(x.label ?? "Reward time").trim().slice(0, 30) || "Reward time", night: n(x.night, 30, 240), earn, cap: n(x.cap, 420, 3000) };
}
const cleanMoney = (m) => ({ currency: typeof m?.currency === "string" && /^[A-Z]{3}$/.test(m.currency) ? m.currency : "" });

// The Gate (Build 10): the "why?" chooser on every phone unlock and PC sign-in/unlock.
//   gate: { phone: true, pc: true, grace: 2, minutes: [10, 20, 30],
//           fun: [{ kind: "videos", label: "Videos", app: "com.google.android.youtube" }, ...],
//           watch: ["com.instagram.android", ...],   apps that bring the Gate back if opened without Fun.
//           dual: ["com.brave.browser"] }  apps for both work and fun: Purpose lets them through for 10 min.
const DEFAULT_FUN = [
  { kind: "comics", label: "Comics", app: "com.brave.browser" },
  { kind: "videos", label: "Videos", app: "com.google.android.youtube" },
  { kind: "chat", label: "Chat", app: "com.whatsapp" },
  { kind: "games", label: "Games", app: "" },
];
const DEFAULT_WATCH = ["com.google.android.youtube", "com.instagram.android"];
const DEFAULT_DUAL = ["com.brave.browser"];
const PKG = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;
function cleanGate(g) {
  const x = g && typeof g === "object" ? g : {};
  const grace = Number(x.grace);
  const minutes = Array.isArray(x.minutes) ? x.minutes.map(Number).filter((m) => Number.isInteger(m) && m > 0 && m <= 240).slice(0, 4) : [];
  const fun = Array.isArray(x.fun)
    ? x.fun
        .filter((f) => f && /^[a-z]{1,20}$/.test(f.kind))
        .slice(0, 6)
        .map((f) => ({ kind: f.kind, label: String(f.label || f.kind).slice(0, 20), app: PKG.test(f.app ?? "") ? f.app : "" }))
    : [];
  return {
    phone: x.phone !== false,
    pc: x.pc !== false,
    grace: Number.isInteger(grace) && grace >= 0 && grace <= 30 ? grace : 2,
    minutes: minutes.length ? minutes : [10, 20, 30],
    fun: fun.length ? fun : DEFAULT_FUN,
    watch: Array.isArray(x.watch) ? x.watch.filter((p) => PKG.test(p)).slice(0, 30) : DEFAULT_WATCH,
    dual: Array.isArray(x.dual) ? x.dual.filter((p) => PKG.test(p)).slice(0, 10) : DEFAULT_DUAL,
  };
}

// The look: the accent colour picked on the PC ("#3d7cf4"), or null for the default. The phone app uses
// its wallpaper's colour instead (Material You).
const cleanTheme = (t) => ({ accent: t && /^#[0-9a-fA-F]{6}$/.test(t.accent ?? "") ? t.accent.toLowerCase() : null });

export function readSettings() {
  const data = existsSync(file()) ? matter(readFileSync(file(), "utf8")).data : {};
  const goal = Number(data.reading?.goalBooks);
  return {
    game: data.game !== false,
    day: cleanDay(data.day),
    reading: { goalBooks: Number.isInteger(goal) && goal > 0 ? goal : null },
    sleep: cleanSleep(data.sleep),
    rewards: cleanRewards(data.rewards),
    gate: cleanGate(data.gate),
    theme: cleanTheme(data.theme),
    money: cleanMoney(data.money),
  };
}

export function writeSettings(changes) {
  const note = existsSync(file()) ? matter(readFileSync(file(), "utf8")) : { data: { type: "settings" }, content: "\nLife OS settings. `game: false` hides XP, levels and streaks.\n" };
  const data = { ...note.data };
  if (typeof changes.game === "boolean") data.game = changes.game;
  if (changes.reading && typeof changes.reading === "object") {
    const goal = Number(changes.reading.goalBooks);
    data.reading = { goalBooks: Number.isInteger(goal) && goal > 0 && goal <= 500 ? goal : null };
  }
  if (changes.day && typeof changes.day === "object") data.day = cleanDay({ ...cleanDay(data.day), ...changes.day });
  if (changes.sleep && typeof changes.sleep === "object") data.sleep = cleanSleep({ ...cleanSleep(data.sleep), ...changes.sleep });
  if (changes.theme && typeof changes.theme === "object") data.theme = cleanTheme(changes.theme);
  if (changes.gate && typeof changes.gate === "object") data.gate = cleanGate({ ...cleanGate(data.gate), ...changes.gate });
  if (changes.rewards && typeof changes.rewards === "object") data.rewards = cleanRewards({ ...cleanRewards(data.rewards), ...changes.rewards });
  if (changes.money && typeof changes.money === "object") data.money = cleanMoney(changes.money);
  backup(file());
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), matter.stringify(note.content, data));
  return readSettings();
}
