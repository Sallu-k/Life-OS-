// Adds reading material to the vault's Knowledge folder (scripts/lib/knowledge.mjs). Creates new notes only,
// never overwrites. The internet is used only while this runs (Wikipedia, Project Gutenberg).
//   npm run add-knowledge -- wiki "Euclid" "Spinoza" "Transistor"   one card per topic (a new deck file)
//   npm run add-knowledge -- epub "C:/Books/Some Book.epub"          a whole book, read passage by passage
//   npm run add-knowledge -- gutenberg 14474 ["Title" "Author"]       a public-domain book by its number
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadEnvLocal, slugify, today, vaultRoot } from "./lib/vault-write.mjs";

const USER_AGENT = "lifeos-personal-script";
const WORDS = { min: 120, max: 220 }; // a passage: about a minute of reading
const PER_FILE = 40; // passages per section file

loadEnvLocal();
const [mode, ...args] = process.argv.slice(2);
const knowledge = join(vaultRoot(), "Knowledge");

// ---------- text helpers ----------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
export function htmlToParagraphs(html) {
  const text = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|tr)>|<br\s*\/?>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m)));
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 1);
}

// Paragraphs -> passages of about WORDS.min..max words, split at paragraph ends (or sentence ends for very
// long paragraphs), so each passage reads as a whole.
export function toPassages(paragraphs) {
  const words = (s) => s.split(/\s+/).filter(Boolean).length;
  const pieces = paragraphs.flatMap((p) => (words(p) <= WORDS.max ? [p] : p.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g)?.map((s) => s.trim()) ?? [p]));
  const out = [];
  let cur = [];
  let n = 0;
  for (const piece of pieces) {
    const w = words(piece);
    if (n > 0 && n + w > WORDS.max) {
      out.push(cur.join("\n\n"));
      cur = [];
      n = 0;
    }
    cur.push(piece);
    n += w;
    if (n >= WORDS.min) {
      out.push(cur.join("\n\n"));
      cur = [];
      n = 0;
    }
  }
  if (cur.length) out.push(cur.join("\n\n"));
  return out;
}

function newFolder(base, name) {
  let slug = slugify(name) || `book-${Date.now()}`;
  for (let i = 2; existsSync(join(base, slug)); i++) slug = `${slugify(name)}-${i}`;
  return slug;
}

// Writes Knowledge/Reading/<slug>/: index.md and 001.md… (passages split by "---").
function writeBook({ title, author, source }, passages) {
  if (!passages.length) throw new Error("No text found in that book.");
  const base = join(knowledge, "Reading");
  const slug = newFolder(base, title);
  const dir = join(base, slug);
  mkdirSync(dir, { recursive: true });
  const yaml = (s) => JSON.stringify(String(s ?? ""));
  writeFileSync(join(dir, "index.md"), `---\ntype: long-read\ntitle: ${yaml(title)}\nauthor: ${yaml(author)}\nsource: ${yaml(source)}\nadded: ${today()}\npassages: ${passages.length}\n---\n# ${title}\n\nRead a passage at a time on the Gate and the Knowledge page.\n`, { flag: "wx" });
  for (let i = 0; i * PER_FILE < passages.length; i++) {
    const part = passages.slice(i * PER_FILE, (i + 1) * PER_FILE);
    writeFileSync(join(dir, `${String(i + 1).padStart(3, "0")}.md`), `${part.join("\n\n---\n\n")}\n`, { flag: "wx" });
  }
  console.log(`Added "${title}" (${passages.length} passages) to Knowledge/Reading/${slug}/`);
}

// ---------- the three sources ----------

async function wiki(topics) {
  if (!topics.length) throw new Error('Give one or more topics, e.g. wiki "Euclid" "Transistor"');
  const cards = [];
  for (const topic of topics) {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.replace(/ /g, "_"))}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      console.log(`Skipped "${topic}": Wikipedia answered ${res.status}`);
      continue;
    }
    const page = await res.json();
    const sentences = String(page.extract ?? "").match(/[^.!?]+[.!?]+(\s|$)/g) ?? [String(page.extract ?? "")];
    const text = sentences.slice(0, 3).join("").trim();
    if (!text) continue;
    cards.push(`## ${page.title}\n${text}\nSource: ${page.content_urls?.desktop?.page ?? `Wikipedia, ${page.title}`}\n`);
    console.log(`Card: ${page.title}`);
  }
  if (!cards.length) return;
  const dir = join(knowledge, "Cards");
  mkdirSync(dir, { recursive: true });
  let name = `Wikipedia ${today()}`;
  for (let i = 2; existsSync(join(dir, `${name}.md`)); i++) name = `Wikipedia ${today()} ${i}`;
  writeFileSync(join(dir, `${name}.md`), `---\ntype: deck\nsource: Wikipedia\n---\n${cards.join("\n")}`, { flag: "wx" });
  console.log(`Added ${cards.length} cards to Knowledge/Cards/${name}.md`);
}

function epub(file) {
  const path = resolve(String(file ?? ""));
  if (!existsSync(path)) throw new Error(`No such file: ${file}`);
  const tmp = mkdtempSync(join(tmpdir(), "lifeos-epub-"));
  try {
    // An EPUB is a zip; Windows' own tar.exe reads zips (Git's GNU tar does not).
    const tar = process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";
    execFileSync(tar, ["-xf", path, "-C", tmp], { stdio: "ignore" });
    const container = readFileSync(join(tmp, "META-INF", "container.xml"), "utf8");
    const opfPath = join(tmp, /full-path="([^"]+)"/.exec(container)?.[1] ?? "");
    const opf = readFileSync(opfPath, "utf8");
    const tag = (name) => new RegExp(`<dc:${name}[^>]*>([\\s\\S]*?)</dc:${name}>`, "i").exec(opf)?.[1]?.trim() ?? null;
    const items = Object.fromEntries([...opf.matchAll(/<item\b[^>]*>/g)].map((m) => [/\bid="([^"]+)"/.exec(m[0])?.[1], /\bhref="([^"]+)"/.exec(m[0])?.[1]]));
    const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => items[m[1]]).filter(Boolean);
    const paragraphs = spine.flatMap((href) => {
      const f = join(dirname(opfPath), decodeURIComponent(href.split("#")[0]));
      return existsSync(f) ? htmlToParagraphs(readFileSync(f, "utf8")) : [];
    });
    writeBook({ title: tag("title") ?? "Untitled book", author: tag("creator"), source: `EPUB: ${path.split(/[\\/]/).pop()}` }, toPassages(paragraphs));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function gutenberg(id, givenTitle, givenAuthor) {
  if (!/^\d+$/.test(String(id ?? ""))) throw new Error("Give the book's number, e.g. gutenberg 14474");
  // Gutenberg serves the same text at several addresses; one may be busy.
  const mirror = `https://gutenberg.pglaf.org/${String(id).slice(0, -1).split("").join("/") || "0"}/${id}`; // the official mirror: 14474 -> 1/4/4/7/14474
  const urls = [`https://www.gutenberg.org/ebooks/${id}.txt.utf-8`, `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`, `${mirror}/${id}-0.txt`, `${mirror}/${id}.txt`];
  let raw = null;
  let last = 0;
  for (const url of urls) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) {
      raw = (await res.text()).replace(/\r\n/g, "\n");
      break;
    }
    last = res.status;
  }
  if (raw === null) throw new Error(`Project Gutenberg answered ${last} (try again later)`);
  const start = raw.search(/^\*\*\* ?START OF.*$/m);
  const end = raw.search(/^\*\*\* ?END OF.*$/m);
  const body = raw.slice(start >= 0 ? raw.indexOf("\n", start) + 1 : 0, end >= 0 ? end : undefined);
  // Hard-wrapped lines joined back into paragraphs.
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter((p) => p.length > 1);
  // Title and author: given on the command line, else the file's header, else the book's first heading.
  const firstHeading = paragraphs.find((p) => p.length > 3 && p.length < 80 && !/^(produced|transcrib|this ebook|e-text)/i.test(p));
  const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : s);
  const title = givenTitle || /^Title:\s*(.+)$/m.exec(raw)?.[1]?.trim() || (firstHeading ? titleCase(firstHeading) : `Gutenberg ${id}`);
  const author = givenAuthor || /^Author:\s*(.+)$/m.exec(raw)?.[1]?.trim() || null;
  writeBook({ title, author, source: `https://www.gutenberg.org/ebooks/${id}` }, toPassages(paragraphs));
}

const run = { wiki: () => wiki(args), epub: () => epub(args[0]), gutenberg: () => gutenberg(args[0], args[1], args[2]) }[mode];
if (!run) {
  console.log('Usage: npm run add-knowledge -- wiki "Topic" … | epub "<file.epub>" | gutenberg <number> ["Title" "Author"]');
  process.exit(1);
}
Promise.resolve()
  .then(run)
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
