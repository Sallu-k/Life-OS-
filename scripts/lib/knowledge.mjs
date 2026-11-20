// Knowledge: short cards and long reads, a little every time you reach for leisure (the Gate), and on the
// Knowledge page. Plain Markdown in the vault, live only (never built into pages: some is copyrighted).
//   Knowledge/Cards/<deck>.md       "## Title" blocks: 1-5 lines, "Source: …", optional "Q: …" / "A: …"
//   Knowledge/Reading/<book>/       index.md (title, author, source) + 001.md, 002.md… passages split by "---"
//   Collections/Books/*.md          lines in "## Quotes" (starting with ">") come back as cards too
//   Logs/Knowledge/YYYY-MM.md       one line per event:  - 2026-11-21 14:03 knew science/entropy
// Spacing (testing effect + spacing): a card read or recalled moves up a box; each box waits longer
// (1, 3, 7, 16, 35, 90 days); "not yet" sends it back to box 1. All state is worked out from the log.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import matter from "gray-matter";
import { backup } from "./days.mjs";
import { collection, getSection, updateItem } from "./notes.mjs";
import { slugify, vaultRoot } from "./vault-write.mjs";

export const INTERVALS = [1, 3, 7, 16, 35, 90]; // days to wait in box 1..6
export const KINDS = ["read", "knew", "notyet", "passage", "current"];
const LINE = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) (read|knew|notyet|passage|current) ([a-z0-9][a-z0-9/:._-]{0,160})$/;
const root = () => join(vaultRoot(), "Knowledge");
const logDir = () => join(vaultRoot(), "Logs", "Knowledge");
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const listMd = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : []);

// ---------- reading the library ----------

// A deck file -> cards. Lines "Source:", "Q:" and "A:" are fields; the rest is the card's text.
export function parseDeck(deck, text) {
  const body = matter(text).content;
  const cards = [];
  for (const block of body.split(/^## /m).slice(1)) {
    const [titleLine, ...rest] = block.split(/\r?\n/);
    const title = titleLine.trim();
    if (!title) continue;
    const card = { id: `${deck}/${slugify(title)}`, deck, title, text: "", source: null, q: null, a: null };
    const lines = [];
    for (const raw of rest) {
      const line = raw.trim();
      const m = /^(Source|Q|A):\s*(.+)$/.exec(line);
      if (m) card[m[1] === "Source" ? "source" : m[1].toLowerCase()] = m[2].trim();
      else if (line) lines.push(line);
    }
    card.text = lines.join("\n");
    if (card.text || card.q) cards.push(card);
  }
  return cards;
}

function bookQuotes() {
  const dir = join(vaultRoot(), collection("books").folder);
  const cards = [];
  for (const f of listMd(dir)) {
    const note = matter(readFileSync(join(dir, f), "utf8"));
    const slug = basename(f, ".md");
    for (const raw of getSection(note.content, "Quotes").split(/\r?\n/)) {
      const text = raw.replace(/^\s*>\s?/, "").trim();
      if (!/^\s*>/.test(raw) || text.length < 8) continue;
      const hash = createHash("sha1").update(text).digest("hex").slice(0, 8);
      cards.push({ id: `books/${slug}/${hash}`, deck: "books", title: String(note.data.title ?? slug), text, source: String(note.data.title ?? slug), q: null, a: null });
    }
  }
  return cards;
}

export function allCards() {
  const dir = join(root(), "Cards");
  const decks = listMd(dir).flatMap((f) => parseDeck(slugify(basename(f, ".md")), readFileSync(join(dir, f), "utf8")));
  return [...decks, ...bookQuotes()];
}

// Title pages, contents lists and scan credits: mostly capitals, or the telltale words.
export function frontMatter(text) {
  if (/\b(CONTENTS|ILLUSTRATIONS|Produced by|Project Gutenberg|Transcriber)\b/.test(text.slice(0, 400))) return true;
  const numbers = (text.match(/\b\d{1,3}\b/g) ?? []).length;
  if (numbers >= 6 || /\b\d{3}\b/.test(text.slice(0, 150))) return true; // a list with page numbers
  const lowerShare = (s) => {
    const letters = s.replace(/[^A-Za-z]/g, "");
    return letters.length ? letters.replace(/[^a-z]/g, "").length / letters.length : 1;
  };
  return lowerShare(text) < 0.5 || lowerShare(text.slice(0, 120)) < 0.3; // a title page, all capitals
}

// Long reads: each book's passages in order (files 001.md, 002.md…, passages split by a "---" line).
export function readings() {
  const dir = join(root(), "Reading");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-z0-9-]+$/.test(d.name))
    .map((d) => {
      const base = join(dir, d.name);
      const info = existsSync(join(base, "index.md")) ? matter(readFileSync(join(base, "index.md"), "utf8")).data : {};
      const passages = listMd(base)
        .filter((f) => f !== "index.md")
        .flatMap((f) => readFileSync(join(base, f), "utf8").split(/^---\s*$/m))
        .map((p) => p.replace(/\[Illustration[^\]]*\]/g, "").trim()) // picture captions from scanned books
        .filter(Boolean);
      // Skip front matter at the start (title page, contents, credits): it reads badly as a passage.
      while (passages.length > 1 && frontMatter(passages[0])) passages.shift();
      return { slug: d.name, title: String(info.title ?? d.name), author: info.author ? String(info.author) : null, source: info.source ? String(info.source) : null, passages };
    })
    .filter((b) => b.passages.length);
}

// ---------- the log ----------

export function lineOf(e, now = new Date()) {
  if (!e || typeof e !== "object" || !KINDS.includes(e.kind)) return null;
  const at = e.at === undefined ? `${ymd(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}` : String(e.at);
  const line = `- ${at} ${e.kind} ${String(e.id ?? "")}`;
  return LINE.test(line) ? line : null;
}

// Saves a batch of events (the phone sends what it queued while away); a resent batch counts once.
export function logKnowledge(events) {
  const byMonth = new Map();
  for (const e of (Array.isArray(events) ? events : [events]).slice(0, 500)) {
    const line = lineOf(e);
    if (line) byMonth.set(line.slice(2, 9), [...(byMonth.get(line.slice(2, 9)) ?? []), line]);
  }
  let saved = 0;
  for (const [month, lines] of byMonth) {
    const file = join(logDir(), `${month}.md`);
    mkdirSync(dirname(file), { recursive: true });
    const old = existsSync(file) ? readFileSync(file, "utf8") : `---\ntype: knowledge-log\nmonth: ${month}\n---\n# Knowledge ${month}\n\n`;
    const have = new Set(old.split(/\r?\n/));
    const fresh = lines.filter((l) => !have.has(l));
    if (!fresh.length) continue;
    backup(file);
    writeFileSync(file, `${old.trimEnd()}\n${fresh.join("\n")}\n`);
    saved += fresh.length;
  }
  return saved;
}

export function readLog() {
  const out = [];
  for (const f of listMd(logDir()))
    for (const raw of readFileSync(join(logDir(), f), "utf8").split(/\r?\n/)) {
      const m = LINE.exec(raw.trim());
      if (m) out.push({ date: m[1], time: m[2], kind: m[3], id: m[4] });
    }
  return out.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

// ---------- spacing and progress, worked out from the log ----------

// { cardId: { box, due, seen } } — box 0 means never seen.
export function cardStates(log) {
  const s = {};
  for (const e of log) {
    if (!["read", "knew", "notyet"].includes(e.kind)) continue;
    const c = (s[e.id] ??= { box: 0, due: null, seen: 0 });
    c.seen++;
    c.box = e.kind === "notyet" ? 1 : Math.min(INTERVALS.length, c.box + 1);
    c.due = addDays(e.date, INTERVALS[c.box - 1]);
  }
  return s;
}

// Each book: how far you have read (the next passage), and which book is current.
export function readingStates(log, books) {
  const pos = {};
  let current = null;
  for (const e of log) {
    if (e.kind === "current") current = e.id;
    if (e.kind === "passage") {
      const [slug, n] = e.id.split(":");
      pos[slug] = Math.max(pos[slug] ?? 0, Number(n) + 1);
    }
  }
  if (!books.some((b) => b.slug === current)) current = books.find((b) => (pos[b.slug] ?? 0) < b.passages.length)?.slug ?? null;
  return { pos, current };
}

// A day's own shuffle: the same order all day, a different one tomorrow (so new cards vary).
const dayRank = (id, today) => createHash("sha1").update(`${today}|${id}`).digest().readUInt32BE(0);

// A short session: due cards first (as a question when they have one), then new cards from different
// decks, plus the next passage of the current long read.
export function session(today, n = 3) {
  const cards = allCards();
  const books = readings();
  const log = readLog();
  const states = cardStates(log);
  const { pos, current } = readingStates(log, books);
  const items = [];
  const due = cards.filter((c) => states[c.id]?.due && states[c.id].due <= today).sort((a, b) => states[a.id].due.localeCompare(states[b.id].due));
  for (const c of due.slice(0, Math.max(1, n - 1))) items.push({ type: c.q ? "recall" : "card", ...c, box: states[c.id].box });
  const fresh = cards.filter((c) => !states[c.id]).sort((a, b) => dayRank(a.id, today) - dayRank(b.id, today));
  const usedDecks = new Set(items.map((i) => i.deck));
  for (const c of fresh) {
    if (items.length >= n) break;
    if (usedDecks.has(c.deck) && fresh.some((x) => !usedDecks.has(x.deck))) continue; // spread across decks
    items.push({ type: "card", ...c, box: 0 });
    usedDecks.add(c.deck);
  }
  const book = books.find((b) => b.slug === current);
  const at = book ? (pos[book.slug] ?? 0) : 0;
  const passage = book && at < book.passages.length ? { type: "passage", book: book.slug, title: book.title, author: book.author, index: at, total: book.passages.length, text: book.passages[at] } : null;
  return { items, passage };
}

// Several passages in a row from one book (the Knowledge page's "Continue reading").
export function passages(slug, count = 5) {
  const book = readings().find((b) => b.slug === slug);
  if (!book) throw new Error("knowledge: no such long read");
  const at = readingStates(readLog(), [book]).pos[slug] ?? 0;
  return book.passages.slice(at, at + Math.max(1, Math.min(20, count))).map((text, i) => ({ type: "passage", book: slug, title: book.title, author: book.author, index: at + i, total: book.passages.length, text }));
}

export function library(today) {
  const cards = allCards();
  const books = readings();
  const log = readLog();
  const states = cardStates(log);
  const { pos, current } = readingStates(log, books);
  const decks = [...new Set(cards.map((c) => c.deck))].map((deck) => {
    const own = cards.filter((c) => c.deck === deck);
    return {
      deck,
      count: own.length,
      seen: own.filter((c) => states[c.id]).length,
      known: own.filter((c) => (states[c.id]?.box ?? 0) >= 3).length,
      due: own.filter((c) => states[c.id]?.due && states[c.id].due <= today).length,
      cards: own.map((c) => ({ ...c, box: states[c.id]?.box ?? 0 })),
    };
  });
  const month = addDays(today, -30);
  const recent = log.filter((e) => e.date > month);
  const knew = recent.filter((e) => e.kind === "knew").length;
  const notyet = recent.filter((e) => e.kind === "notyet").length;
  const weekAgo = addDays(today, -7);
  return {
    decks,
    books: books.map((b) => ({ slug: b.slug, title: b.title, author: b.author, source: b.source, position: pos[b.slug] ?? 0, total: b.passages.length, current: b.slug === current })),
    stats: {
      cards: cards.length,
      known: Object.values(states).filter((s) => s.box >= 3).length,
      due: cards.filter((c) => states[c.id]?.due && states[c.id].due <= today).length,
      recall: knew + notyet ? knew / (knew + notyet) : null,
      passagesWeek: log.filter((e) => e.kind === "passage" && e.date > weekAgo).length,
      cardsWeek: log.filter((e) => ["read", "knew", "notyet"].includes(e.kind) && e.date > weekAgo).length,
    },
  };
}

// A line from a book you are reading, kept in that book's "## Quotes" (it comes back later as a card).
export function saveQuote(slug, text) {
  const line = String(text ?? "").replace(/\s+/g, " ").trim();
  if (line.length < 3 || line.length > 600) throw new Error("quote: 3 to 600 characters");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug))) throw new Error("quote: unknown book");
  const file = join(vaultRoot(), collection("books").folder, `${slug}.md`);
  if (!existsSync(file)) throw new Error("quote: unknown book");
  const old = getSection(matter(readFileSync(file, "utf8")).content, "Quotes").trim();
  updateItem("books", slug, { Quotes: `${old ? `${old}\n` : ""}> ${line}` });
  return { saved: true };
}

// A week's reading (for the weekly review): counts only, never card or passage text.
export function knowledgeBetween(from, to) {
  const log = readLog().filter((e) => e.date >= from && e.date <= to);
  const n = (kind) => log.filter((e) => e.kind === kind).length;
  return { cards: n("read") + n("knew") + n("notyet"), knew: n("knew"), notyet: n("notyet"), passages: n("passage") };
}
