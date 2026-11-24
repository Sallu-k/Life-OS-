// Food search for the Food tab (Build 26). Forgiving on purpose: no AI, so it copes with
// - spelling ("macaroonie", "biriyani", "mandhi", "chiken" still find the food),
// - local words (anda, koli, gosht, meen, bhaat, mosaru...: ALIASES below, add your own),
// - what you eat: foods you add most often come first among the matches.
import type { Food } from "./nutrition";

// Local or other words -> a word that is in the food names. Keys are lowercase.
const ALIASES: Record<string, string[]> = {
  anda: ["egg"], ande: ["egg"], motte: ["egg"], omlet: ["omelette"],
  koli: ["chicken"], kozhi: ["chicken"], murg: ["chicken"], murgh: ["chicken"], murgi: ["chicken"], kfc: ["broasted"],
  gosht: ["mutton", "beef"], mamsa: ["mutton"], bakra: ["mutton"], gai: ["beef"], bade: ["beef"],
  meen: ["fish"], meenu: ["fish"], machli: ["fish"], machhi: ["fish"], jhinga: ["prawn"], sigadi: ["prawn"], yetti: ["prawn"],
  bangda: ["mackerel"], bangude: ["mackerel"], surmai: ["kingfish"], anjal: ["kingfish"], paplet: ["pomfret"],
  chawal: ["rice"], bhaat: ["rice"], anna: ["rice"], kanji: ["ganji"],
  roti: ["chapati", "roti"], parata: ["parotta"], porotta: ["parotta"], barotta: ["parotta"], khubz: ["kuboos"],
  shavige: ["shevai"], semiya: ["shevai"], sevai: ["shevai"], spaghetti: ["pasta"], penne: ["pasta"],
  dahi: ["curd"], mosaru: ["curd"], doodh: ["milk"], haalu: ["milk"], chai: ["tea"], chaha: ["tea"], majjige: ["buttermilk"],
  kela: ["banana"], bale: ["banana"], aam: ["mango"], mavu: ["mango"], badam: ["almonds"], khajur: ["dates"], kharjura: ["dates"],
  kaju: ["cashews"], kadlekai: ["peanuts"], shenga: ["peanuts"], moongphali: ["peanuts"],
  salan: ["curry"], saaru: ["rasam"], payasa: ["payasam"], shir: ["kheer"], meetha: ["sweets"],
};

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// A rough "sounds like" key: drops the h of dh/th/kh/sh, the vowels after the first letter, double letters.
export function soundKey(s: string): string {
  const t = letters(s).replace(/ck/g, "k").replace(/ph/g, "f").replace(/q/g, "k").replace(/w/g, "v").replace(/([^aeiou])h/g, "$1");
  return (t.slice(0, 1) + t.slice(1).replace(/[aeiouy]/g, "")).replace(/(.)\1+/g, "$1");
}

// Typos between two words: letters wrong, missing, extra, or two swapped ("chikcen") each count 1.
export function typos(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// How many typos a word of this length may have: none up to 3 letters, 1 up to 5, then 2.
const allowed = (word: string) => (word.length <= 3 ? 0 : word.length <= 5 ? 1 : 2);

// The fewest typos between the word and the start of a name word (or of the rest of the name without
// spaces, so "alfaham" fits "al faham"), comparing a start of about the same length: a half-typed word counts.
function fewestTypos(word: string, words: string[]): number {
  let best = Infinity;
  for (let i = 0; i < words.length; i++) {
    const rest = words.slice(i).join("");
    for (const len of [word.length - 1, word.length, word.length + 1]) {
      if (len > 0 && len <= rest.length) best = Math.min(best, typos(word, rest.slice(0, len)));
    }
  }
  return best;
}

// How well one typed word fits a name: 4 the name starts with it, 3 a word starts with it, 2 it is inside,
// below 2 a guess: 1.5 it sounds like a word's start, 1 to 1.3 it is a few typos away (both add up); 0 no match.
function wordScore(word: string, name: string): number {
  const lower = name.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
  if (words[0]?.startsWith(word)) return 4;
  if (words.some((w) => w.startsWith(word))) return 3;
  if (lower.includes(word)) return 2;
  if (word.length < 3) return 0;
  const key = soundKey(word);
  const sounds = words.some((_, i) => soundKey(words.slice(i).join("")).startsWith(key));
  const n = fewestTypos(word, words);
  const close = n <= allowed(word) ? 0.3 - n * 0.1 : 0;
  return sounds ? 1.5 + close : close ? 1 + close : 0;
}

function bestScore(word: string, name: string): number {
  const tries = [word, ...(ALIASES[word] ?? [])];
  return Math.max(...tries.map((t) => wordScore(t, name)));
}

type Hit = { f: Food; i: number; guess: boolean; score: number };

export function searchFoods(foods: Food[], query: string, used: Record<string, number> = {}, limit = 15): Food[] {
  const words = query.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  if (!words.length) return [];
  const hits = foods
    .map((f, i) => {
      const scores = words.map((w) => bestScore(w, f.name));
      return { f, i, guess: scores.some((s) => s < 2), score: scores.includes(0) ? 0 : scores.reduce((a, b) => a + b, 0) };
    })
    .filter((r) => r.score > 0);
  const byUse = (a: Hit, b: Hit) => (used[b.f.id] ?? 0) - (used[a.f.id] ?? 0);
  // Guesses only when nothing matches for real ("porotta" should not also bring "protein"); the closest first.
  const real = hits.filter((r) => !r.guess);
  const top = Math.max(...hits.map((r) => r.score));
  const guesses = hits.filter((r) => r.score >= top - 0.15); // only the best guesses, not every far one
  return (real.length ? real.sort((a, b) => byUse(a, b) || b.score - a.score || a.i - b.i) : guesses.sort((a, b) => b.score - a.score || byUse(a, b) || a.i - b.i))
    .slice(0, limit)
    .map((r) => r.f);
}
