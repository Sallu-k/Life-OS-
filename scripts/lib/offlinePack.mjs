// The phone's offline pack: everything the app can show, in one answer, so it works without the PC.
// The same data the single routes give (GET /api/day/..., /api/review/..., ...), keyed the way the app
// keeps them. Asked for by the app when it reaches the PC (src/lib/pack.ts). Reads only, never writes.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getDay, readHabits, readNotes, readOnce } from "./days.mjs";
import { getPlan } from "./plan.mjs";
import { getMoney } from "./money.mjs";
import { getRewards } from "./rewards.mjs";
import { gateBetween } from "./gate.mjs";
import { library, passages, session } from "./knowledge.mjs";
import { listItems } from "./notes.mjs";
import { readSettings } from "./settings.mjs";
import { getReview, weekOf } from "./review.mjs";
import { vaultRoot } from "./vault-write.mjs";

const PLAN_DAYS = 365; // as src/lib/plan.ts
const REVIEW_WEEKS = 26; // past weeks with their numbers, even without a written review
const PASSAGES = 60; // per long read, from where you are
const CURRENT = 400; // the book being read: about 70,000 words, days of reading away from the PC
const BACK = 10; // and a few parts before, so the reader can turn back a page

const files = (folder, pattern) => {
  const dir = join(vaultRoot(), folder);
  return existsSync(dir) ? readdirSync(dir).filter((f) => pattern.test(f)).map((f) => f.slice(0, -3)) : [];
};
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// One part failing (a broken note) leaves that part out instead of losing the whole pack.
const tryRead = (read) => {
  try {
    return read();
  } catch {
    return null;
  }
};

export const offlinePack = (today) => readOnce(() => makePack(today));

function makePack(today) {
  const dates = [...new Set([...files("Daily", /^\d{4}-\d{2}-\d{2}\.md$/), today])].sort();
  const days = {};
  for (const date of dates) {
    const day = tryRead(() => getDay(date));
    if (day) days[date] = { ...day, gate: gateBetween(date, date) };
  }

  const kept = {};
  const keep = (path, read) => {
    const data = tryRead(read);
    if (data !== null) kept[path] = data;
  };
  keep("habits", () => readHabits());
  keep("settings", () => readSettings());
  keep("rewards", () => getRewards(today));
  keep("notes", () => ({ notes: readNotes() }));
  keep("knowledge/session?n=5", () => session(today, 5));
  const reading = tryRead(() => listItems("books").filter((b) => b.status === "reading").map((b) => ({ slug: b.slug, title: String(b.title) }))) ?? [];
  keep("knowledge/library", () => ({ ...library(today), reading }));
  const weeks = new Set(files("Weekly", /^\d{4}-W\d{2}\.md$/));
  for (let i = 0; i < REVIEW_WEEKS; i++) weeks.add(weekOf(addDays(today, -7 * i)).id);
  for (const id of weeks) keep(`review/${id}`, () => getReview(id));
  for (const month of new Set([...files("Finance", /^\d{4}-\d{2}\.md$/), today.slice(0, 7)])) keep(`money/${month}`, () => getMoney(month));

  const reads = {};
  for (const book of kept["knowledge/library"]?.books ?? []) {
    const n = (book.current ? CURRENT : PASSAGES) + BACK;
    const list = tryRead(() => passages(book.slug, n, n, Math.max(0, book.position - BACK)));
    if (list) reads[book.slug] = list;
  }

  return { made: today, days, kept, plan: tryRead(() => getPlan(today, addDays(today, PLAN_DAYS))), passages: reads };
}
