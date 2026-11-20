import { api } from "./api";
import { send } from "./offline";

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
  text: string;
}

export interface Session {
  items: Card[];
  passage: Passage | null;
}

export interface Library {
  decks: { deck: string; count: number; seen: number; known: number; due: number; cards: Card[] }[];
  books: { slug: string; title: string; author: string | null; source: string | null; position: number; total: number; current: boolean }[];
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
export const logEvent = (e: Event) => send({ kind: "post", path: "knowledge/log", body: { events: [{ ...e, at: stamp() }] } });

export const passageId = (p: Passage) => `${p.book}:${p.index}`;

export const loadPassages = (book: string, n = 5) => api<{ passages: Passage[] }>(`knowledge/read/${book}?n=${n}`).then((r) => r.passages);

export const makeCurrent = (book: string) => api("knowledge/current", { method: "PUT", body: { book } });

export const saveQuote = (book: string, text: string) => api("knowledge/quote", { method: "POST", body: { book, text } });
