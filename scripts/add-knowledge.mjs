// Adds reading material to the vault's Knowledge folder (scripts/lib/knowledge.mjs). Creates new notes only,
// never overwrites. The internet is used only while this runs (Wikipedia, Project Gutenberg).
//   npm run add-knowledge -- wiki "Euclid" "Spinoza" "Transistor"   one card per topic (a new deck file)
//   npm run add-knowledge -- epub "C:/Books/Some Book.epub"          a whole book, read passage by passage
//   npm run add-knowledge -- gutenberg 14474 ["Title" "Author"]       a public-domain book by its number
//   npm run add-knowledge -- text "C:/Books/book.md"                  a book as Markdown: frontmatter title /
//                                                                    author / source, "## " chapters, "> " quotes
//   npm run add-knowledge -- article "https://…" ["Title"]            a web article, cleaned to its paragraphs
import matter from "gray-matter";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
// long paragraphs), so each passage reads as a whole. A long paragraph cut across passages stays one
// paragraph in each (its sentences joined by spaces); a "> " quote keeps its mark in both.
export function toPassages(paragraphs) {
  const words = (s) => s.split(/\s+/).filter(Boolean).length;
  const pieces = paragraphs.flatMap((p, para) => {
    const quote = p.startsWith("> ");
    const body = quote ? p.slice(2) : p;
    const parts = words(body) <= WORDS.max ? [body] : (body.match(/[^.!?]+[.!?]+["”’)*]*\s*|[^.!?]+$/g)?.map((s) => s.trim()) ?? [body]);
    return parts.map((text) => ({ text, para, quote }));
  });
  const out = [];
  let cur = [];
  let n = 0;
  const flush = () => {
    const paras = [];
    for (const piece of cur) {
      const last = paras[paras.length - 1];
      if (last && last.para === piece.para) last.text += ` ${piece.text}`;
      else paras.push({ ...piece });
    }
    out.push(paras.map((x) => (x.quote ? `> ${x.text}` : x.text)).join("\n\n"));
    cur = [];
    n = 0;
  };
  for (const piece of pieces) {
    const w = words(piece.text);
    if (n > 0 && n + w > WORDS.max) flush();
    cur.push(piece);
    n += w;
    if (n >= WORDS.min) flush();
  }
  if (cur.length) flush();
  return out;
}

// Chapters -> passages: a chapter never shares a passage with the next one, and its first passage starts
// with a "## Title" line (scripts/lib/knowledge.mjs reads that as the chapter).
export function chaptersToPassages(chapters) {
  return chapters.flatMap(({ title, paragraphs }) => toPassages(paragraphs).map((p, i) => (i === 0 && title ? `## ${title}\n\n${p}` : p)));
}

// "## " headings split Markdown into chapters; blank lines split paragraphs.
export function markdownChapters(text) {
  const chapters = [];
  let cur = { title: null, paragraphs: [] };
  for (const block of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const p = block.replace(/\s*\n\s*/g, " ").trim();
    if (!p || p === "---" || /^#\s/.test(p)) continue;
    if (p.startsWith("## ")) {
      if (cur.paragraphs.length) chapters.push(cur);
      cur = { title: p.slice(3).trim(), paragraphs: [] };
    } else cur.paragraphs.push(p);
  }
  if (cur.paragraphs.length) chapters.push(cur);
  return chapters;
}

// A web article: the text inside <article> (else <main>, else the page), only its paragraphs, headings,
// quotes and list items, without menus, share buttons and "subscribe" boxes.
export function articleParts(html) {
  const meta = (name) =>
    new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)`, "i").exec(html)?.[1] ??
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, "i").exec(html)?.[1] ??
    null;
  // The article is the <article>/<main> holding most of the page's paragraph text (pages also use
  // <article> for "related" cards); else the whole page.
  const textOf = (s) => [...s.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].reduce((n, m) => n + m[1].replace(/<[^>]+>/g, "").length, 0);
  const all = textOf(html);
  const candidates = ["article", "main"].flatMap((tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => m[1]));
  const best = candidates.filter((c) => textOf(c) >= all * 0.7).sort((a, b) => a.length - b.length)[0] ?? html;
  const body = best.replace(/<(script|style|figure|figcaption|form|nav|aside|button|svg)\b[\s\S]*?<\/\1>/gi, "");
  const clean = (s) => htmlToParagraphs(s).join(" ").trim();
  const junk = /^(share|subscribe|sign up|read more|related|advertisement|listen to this|leave a comment|thanks for reading)/i;
  const caption = /^(by\s|photo\b|image\b|credit\b|illustration\b|\d+ minute (listen|read)\b|\d{1,2}:\d{2} [AP]M\b)|getty images|photograph:|photo by/i;
  const blocks = [...body.matchAll(/<(p|h2|h3|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(([, tag, inner]) => ({ tag: tag.toLowerCase(), t: clean(inner) }));
  const seen = blocks.reduce((m, b) => m.set(b.t, (m.get(b.t) ?? 0) + 1), new Map());
  const chapters = [{ title: null, paragraphs: [] }];
  for (const { tag, t } of blocks) {
    if (t.length < 2 || junk.test(t)) continue;
    if (tag === "h2" || tag === "h3") chapters.push({ title: t, paragraphs: [] });
    else if (seen.get(t) < 2 && !caption.test(t)) chapters[chapters.length - 1].paragraphs.push(tag === "blockquote" ? `> ${t}` : t); // repeated = page furniture (captions, author bio)
  }
  // "Related articles" at the end: short sections with a heading and a line or two, or teaser lines
  // without a full stop.
  const wordsIn = (c) => c.paragraphs.join(" ").split(/\s+/).length;
  while (chapters.length > 1 && wordsIn(chapters[chapters.length - 1]) < 40) chapters.pop();
  const last = chapters[chapters.length - 1].paragraphs;
  while (last.length > 1 && !/[.!?”"’)]$/.test(last[last.length - 1])) last.pop();
  const decode = (s) => (s ? htmlToParagraphs(s).join(" ") : null);
  // The author from the page's structured data (JSON-LD) when there is no author meta tag.
  const ldAuthor = () => {
    for (const [, json] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const found = [JSON.parse(json)].flat().flatMap((x) => [x, ...(x["@graph"] ?? [])]).find((x) => x?.author);
        const a = [found?.author].flat()[0];
        if (a) return typeof a === "string" ? a : (a.name ?? null);
      } catch {
        // not JSON: try the next block
      }
    }
    return null;
  };
  return {
    title: decode(meta("og:title"))?.replace(/\s+\|\s+[^|]+$/, "") /* "Title | Site name" */ ?? decode(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]),
    author: decode(meta("author") ?? meta("article:author")) ?? ldAuthor(),
    chapters: chapters.filter((c) => c.paragraphs.length),
  };
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

// A book already turned into Markdown (e.g. from a PDF), chapters kept.
function text(file) {
  if (!file || !existsSync(file)) throw new Error('Give a Markdown file, e.g. text "C:/Books/book.md"');
  const { data, content } = matter(readFileSync(file, "utf8"));
  const name = resolve(file).split(/[\\/]/).pop();
  writeBook({ title: String(data.title || name.replace(/\.md$/i, "")), author: data.author || null, source: data.source || `Markdown: ${name}` }, chaptersToPassages(markdownChapters(content)));
}

async function article(url, givenTitle) {
  if (!/^https:\/\/\S+$/.test(String(url ?? ""))) throw new Error('Give the article\'s address, e.g. article "https://…"');
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`The site answered ${res.status}`);
  const { title, author, chapters } = articleParts(await res.text());
  if (!chapters.length) throw new Error("No article text found on that page.");
  chapters[0].title ??= givenTitle || title;
  writeBook({ title: givenTitle || title || url, author, source: url }, chaptersToPassages(chapters));
}

// Only when run as a command (the helpers above can be imported by the self-check).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = { wiki: () => wiki(args), epub: () => epub(args[0]), gutenberg: () => gutenberg(args[0], args[1], args[2]), text: () => text(args[0]), article: () => article(args[0], args[1]) }[mode];
  if (!run) {
    console.log('Usage: npm run add-knowledge -- wiki "Topic" … | epub "<file.epub>" | gutenberg <number> ["Title" "Author"] | text "<file.md>" | article "https://…" ["Title"]');
    process.exit(1);
  }
  Promise.resolve()
    .then(run)
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
