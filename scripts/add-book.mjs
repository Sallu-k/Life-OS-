// Creates a new book note from an ISBN or a title, using Open Library.
// Usage: npm run add-book -- 9780141439518
//        npm run add-book -- "The Left Hand of Darkness"
import { existsSync } from "node:fs";
import { join } from "node:path";
import { downloadNew, fail, getJson, loadEnvLocal, readTemplate, setField, slugify, vaultRoot, writeNew, fallbackSlug } from "./lib/vault-write.mjs";

loadEnvLocal();
const input = process.argv.slice(2).join(" ").trim();
if (!input) fail('Usage: npm run add-book -- <isbn | "title">');

const isbn = input.replace(/[-\s]/g, "");
const isIsbn = /^(\d{9}[\dXx]|\d{13})$/.test(isbn);
const query = isIsbn ? `isbn=${isbn}` : `title=${encodeURIComponent(input)}`;
const result = await getJson(`https://openlibrary.org/search.json?${query}&limit=1&fields=title,author_name,isbn,cover_i`);
const doc = result.docs?.[0];
if (!doc) fail(`Open Library found nothing for "${input}". No note was created.`);

const title = doc.title;
const slug = slugify(title) || fallbackSlug("book");
const notePath = join(vaultRoot(), "Collections", "Books", `${slug}.md`);
if (existsSync(notePath)) fail(`Already exists, not overwritten: ${notePath}`);

const cover = doc.cover_i ? await downloadNew(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`, `_assets/covers/${slug}.jpg`) : null;
if (!doc.cover_i) console.log("Open Library has no cover for this book; the site will show a placeholder.");

let note = readTemplate("Book").replace("{{title}}", () => title);
note = setField(note, "title", title);
note = setField(note, "author", doc.author_name?.[0] ?? "");
note = setField(note, "isbn", isIsbn ? isbn : (doc.isbn?.[0] ?? null));
note = setField(note, "cover", cover);
writeNew(notePath, note);
console.log(`Created: ${notePath}`);
