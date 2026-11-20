// Creates many book notes at once from a JSON list. Covers, first-published year and page count
// come from Open Library, but only when the match is confident (title words AND author surname).
// Without a confident match the book keeps a placeholder cover. Existing notes are never overwritten.
//
// Usage: npm run import-books -- path/to/books.json
// Each entry: { "title", "author", "category", "note", "slug", "status", "published" }   (only title is required)
//   "lookup": false skips Open Library for that book; "published": 1988 overrides the looked-up year.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, loadEnvLocal, readTemplate, setField, slugify, USER_AGENT, vaultRoot, writeNew } from "./lib/vault-write.mjs";

const STOP = new Set(["the", "a", "an", "of", "and", "to", "in", "for", "on", "with", "your", "our", "&"]);

// "The Psychology of Money!" -> ["psychology", "money"]
function words(text) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w));
}

// Surnames from "Habeeb Quadri and Sa'ad Quadri" or "Ross (Master Mind Books)".
function surnames(author) {
  return author
    .replace(/\(.*?\)/g, "")
    .split(/\s+(?:and|&)\s+|,/i)
    .map((name) => words(name).at(-1))
    .filter(Boolean);
}

// The main title: the part before a subtitle (":", "(" or "[").
function mainTitle(title) {
  return title.split(/:|\(|\[/)[0];
}
const noBrackets = (title) => title.replace(/\(.*?\)|\[.*?\]/g, "");

const sameWords = (a, b) => a.length === b.length && a.every((w) => b.includes(w));

// Confident only when:
// - with an author: the whole titles have the same words, or the main titles do (only a subtitle
//   after ":" differs); and one of our author surnames appears in the result's authors;
// - without an author: the whole titles have the same words AND the title is distinctive
//   (3+ meaningful words), so short titles like "About Muhammad" never grab a stranger's book.
// This rejects look-alikes such as "The Alchemist Graphic Novel" or "Oxford Chinese Mini Dictionary".
function isMatch(entry, doc) {
  if (!doc.title) return false;
  const fullSame = sameWords(words(noBrackets(entry.title)), words(noBrackets(doc.title)));
  if (!entry.author) return fullSame && words(noBrackets(entry.title)).length >= 3;
  if (!fullSame && !sameWords(words(mainTitle(entry.title)), words(mainTitle(doc.title)))) return false;
  const theirs = words((doc.author_name ?? []).join(" "));
  return surnames(entry.author).some((s) => theirs.includes(s));
}

async function search(params, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(`https://openlibrary.org/search.json?${params}`, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`${res.status} from Open Library`);
      return (await res.json()).docs ?? [];
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i)); // wait a little longer each time
    }
  }
}

// Among confident matches, prefer one with a cover, then the most-published work (the original).
async function lookup(entry) {
  const params = new URLSearchParams({ title: mainTitle(entry.title).trim(), limit: "20", fields: "title,author_name,cover_i,edition_count,first_publish_year,number_of_pages_median" });
  if (entry.author) params.set("author", entry.author.replace(/\(.*?\)/g, "").trim());
  const docs = (await search(params)).filter((d) => isMatch(entry, d));
  docs.sort((a, b) => Number(!!b.cover_i) - Number(!!a.cover_i) || (b.edition_count ?? 0) - (a.edition_count ?? 0));
  return docs[0] ?? null;
}

// Downloads a cover, but drops Open Library's tiny "no image" placeholder.
async function downloadCover(coverId, slug) {
  const rel = `_assets/covers/${slug}.jpg`;
  const dest = join(vaultRoot(), rel);
  if (existsSync(dest)) return rel;
  const res = await fetch(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 5000) return null;
  writeNew(dest, bytes);
  return rel;
}

loadEnvLocal();
const listPath = process.argv[2];
if (!listPath) fail("Usage: npm run import-books -- path/to/books.json");
const books = JSON.parse(readFileSync(listPath, "utf8"));
console.log(`Vault: ${vaultRoot()}\n`);

let created = 0;
let skipped = 0;
const noCover = [];

for (const b of books) {
  if (!b.title) {
    console.log(`SKIP (no title): ${JSON.stringify(b).slice(0, 80)}`);
    skipped++;
    continue;
  }
  const slug = b.slug || slugify(b.title);
  const notePath = join(vaultRoot(), "Collections", "Books", `${slug}.md`);
  if (existsSync(notePath)) {
    console.log(`exists, kept as is: ${slug}`);
    skipped++;
    continue;
  }

  let match = null;
  try {
    if (b.lookup !== false) match = await lookup(b);
  } catch (err) {
    console.log(`  lookup failed for ${b.title} (${err.message})`);
  }
  const cover = match?.cover_i ? await downloadCover(match.cover_i, slug).catch(() => null) : null;
  if (!cover) noCover.push(b.title);

  let note = readTemplate("Book").replace("{{title}}", () => b.title);
  note = setField(note, "title", b.title);
  note = setField(note, "author", b.author ?? null);
  note = setField(note, "status", b.status ?? null);
  note = setField(note, "category", b.category ?? null);
  note = setField(note, "published", b.published ?? match?.first_publish_year ?? null);
  note = setField(note, "pages", match?.number_of_pages_median ?? null);
  note = setField(note, "cover", cover);
  note = setField(note, "note", b.note ?? null);
  writeNew(notePath, note);
  console.log(`created: ${slug}${match ? `  (matched "${match.title}")` : "  (no confident match)"}${cover ? "" : "  [placeholder]"}`);
  created++;
  await new Promise((r) => setTimeout(r, 400)); // be gentle with Open Library
}

console.log(`\nDone: ${created} created, ${skipped} skipped, ${created - noCover.length} with covers.`);
if (noCover.length > 0) console.log(`Placeholder covers (${noCover.length}): ${noCover.join(" | ")}`);
