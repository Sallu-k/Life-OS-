import { api, isOffline } from "./api";
import { packGet, send } from "./offline";

// Knowledge (Build 14): cards and long reads from the vault's Knowledge/ folder, read live from the LifeOS
// server (never built into pages: some passages come from copyrighted EPUBs). What you read and recall is
// logged to Logs/Knowledge/, from which the server works out spacing and reading positions.

export interface Card {
  type: "card" | "recall";
  id: string;
  deck: string;
  title: string;
  text: string;
  source: string | null;
  q: string | null;
  a: string | null;
  box: number;
}

export interface Passage {
  type: "passage";
  book: string;
  title: string;
  author: string | null;
  index: number;
  total: number;
  text: string; // paragraphs split by blank lines; "> " = a quote, *italic*
  chapter?: string | null; // the chapter this part is in (books imported with chapters)
  chapterStart?: boolean; // the chapter's first part
}

export interface Chapter {
  title: string;
  index: number; // its first part
}

export interface Session {
  items: Card[];
  passage: Passage | null;
}

export interface Library {
  decks: { deck: string; count: number; seen: number; known: number; due: number; cards: Card[] }[];
  books: { slug: string; title: string; author: string | null; source: string | null; position: number; total: number; current: boolean; chapters?: Chapter[] }[];
  stats: { cards: number; known: number; due: number; recall: number | null; passagesWeek: number; cardsWeek: number };
  reading?: { slug: string; title: string }[];
}

export type Event = { kind: "read" | "knew" | "notyet" | "passage" | "current"; id: string };

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Logged through the outbox, so it works offline and a resend counts once (the server drops repeats).
export const logEvent = (e: Event) => {
  if (e.kind === "passage") markReadOffline(e.id);
  send({ kind: "post", path: "knowledge/log", body: { events: [{ ...e, at: stamp() }] } });
};

// Parts finished on this phone since the last offline pack (src/lib/pack.ts), so reading offline moves on.
export const READ = "lifeos-read-offline";
function readOffline(): string[] {
  try {
    return JSON.parse(localStorage.getItem(READ) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function markReadOffline(id: string): void {
  try {
    localStorage.setItem(READ, JSON.stringify([...readOffline(), id]));
  } catch {
    // not remembered: offline, the part may show again
  }
}

export const passageId = (p: Passage) => `${p.book}:${p.index}`;

// Where to pick a book up: the PC's bookmark, or further when parts were read on this phone since.
export function resumeAt(book: string, position: number): number {
  const mine = readOffline()
    .filter((id) => id.startsWith(`${book}:`))
    .map((id) => Number(id.split(":")[1]) + 1);
  return Math.max(position, ...mine);
}

// From the PC (from `from`, else from the bookmark); offline, the parts kept on the phone.
export async function loadPassages(book: string, n = 5, from?: number): Promise<Passage[]> {
  try {
    return (await api<{ passages: Passage[] }>(`knowledge/read/${book}?n=${n}${from === undefined ? "" : `&from=${from}`}`)).passages;
  } catch (e) {
    if (!isOffline(e)) throw e;
    const done = new Set(readOffline());
    const kept = (await packGet<Passage[]>(`read:${book}`)) ?? [];
    const next = (from === undefined ? kept.filter((p) => !done.has(passageId(p))) : kept.filter((p) => p.index >= from)).slice(0, n);
    if (!next.length && from === undefined) throw new Error(kept.length ? "You have read every part kept on this phone. More come when the PC is reachable." : "This read is not saved on this phone yet.");
    return next;
  }
}

export const makeCurrent = (book: string) => api("knowledge/current", { method: "PUT", body: { book } });

export const saveQuote = (book: string, text: string) => api("knowledge/quote", { method: "POST", body: { book, text } });
