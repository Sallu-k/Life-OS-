// Reading and writing notes for the LifeOS server. Every write first copies the old file into
// <vault>/.lifeos-backup/<date>/, and nothing is ever hard-deleted (deletes move to <vault>/_trash/).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { COLLECTIONS, cleanValue } from "./collections.mjs";
import { slugify, today, vaultRoot } from "./vault-write.mjs";

// Bare dates stay text (YAML would otherwise turn them into Date objects or fix impossible dates).
function parse(raw) {
  const text = raw.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)/, (_a, o, y, c) => o + y.replace(/^(\s*[\w-]+:[ \t]*)(\d{4}-\d{2}-\d{2})[ \t]*$/gm, '$1"$2"') + c);
  return matter(text);
}

export function collection(name) {
  const c = COLLECTIONS[name];
  if (!c) throw new Error(`Unknown collection "${name}"`);
  return c;
}

const notePath = (c, slug) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Bad name");
  return join(vaultRoot(), c.folder, `${slug}.md`);
};

// The body text under "## Heading", up to the next level-1/2 heading.
export function getSection(body, heading) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return "";
  const out = [];
  for (let i = start + 1; i < lines.length && !/^#{1,2}\s/.test(lines[i]); i++) out.push(lines[i]);
  return out.join("\n").trim();
}

// Replaces (or adds) the text under "## Heading".
export function setSection(body, heading, text) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  const block = [`## ${heading}`, text.trim(), ""];
  if (start === -1) return `${body.trimEnd()}\n\n${block.join("\n")}`;
  let end = start + 1;
  while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join("\n");
}

function toJson(c, slug, raw) {
  const note = parse(raw);
  const item = { slug };
  for (const key of Object.keys(c.fields)) item[key] = note.data[key] ?? null;
  for (const s of c.sections) item[s] = getSection(note.content, s);
  return item;
}

export function listItems(name) {
  const c = collection(name);
  const dir = join(vaultRoot(), c.folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      try {
        return toJson(c, f.slice(0, -3), readFileSync(join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function getItem(name, slug) {
  const c = collection(name);
  const p = notePath(c, slug);
  return existsSync(p) ? toJson(c, slug, readFileSync(p, "utf8")) : null;
}

function backup(file) {
  if (!existsSync(file)) return;
  const rel = file.slice(vaultRoot().length + 1);
  const dest = join(vaultRoot(), ".lifeos-backup", today(), `${Date.now()}-${rel.replace(/[\\/]/g, "__")}`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
}

// Applies the allowed fields/sections in `changes` to a note's text and returns the new text.
function apply(c, raw, changes) {
  const note = parse(raw);
  const data = { ...note.data };
  let body = note.content;
  for (const [key, value] of Object.entries(changes)) {
    if (key in c.fields) data[key] = cleanValue(c.fields[key], value, key);
    else if (c.sections.includes(key)) body = setSection(body, key, String(value ?? ""));
  }
  if (!data.title) throw new Error("title: required");
  return matter.stringify(`\n${body.replace(/^\s+/, "")}`, data);
}

export function updateItem(name, slug, changes) {
  const c = collection(name);
  const p = notePath(c, slug);
  if (!existsSync(p)) throw new Error("Not found");
  const next = apply(c, readFileSync(p, "utf8"), changes);
  backup(p);
  writeFileSync(p, next);
  return getItem(name, slug);
}

// A new note from the vault template (Templates/<Type>.md, or docs/vault-templates). Never overwrites.
export function createItem(name, changes) {
  const c = collection(name);
  const title = String(changes.title ?? "").trim();
  if (!title) throw new Error("title: required");
  const base = slugify(title) || `${c.type}-${Date.now()}`;
  let slug = base;
  for (let n = 2; existsSync(notePath(c, slug)); n++) slug = `${base}-${n}`;
  const p = notePath(c, slug);
  const typeName = c.type[0].toUpperCase() + c.type.slice(1);
  const inVault = join(vaultRoot(), "Templates", `${typeName}.md`);
  const fallback = join(process.cwd(), "docs", "vault-templates", `${typeName}.md`);
  const template = (existsSync(inVault) ? readFileSync(inVault, "utf8") : existsSync(fallback) ? readFileSync(fallback, "utf8") : `---\ntype: ${c.type}\ntitle: ""\n---\n`)
    .replace(/\{\{date:YYYY-MM-DD\}\}/g, today())
    .replace("{{title}}", title.replace(/"/g, '\\"'));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, apply(c, template, changes), { flag: "wx" });
  return getItem(name, slug);
}

export function trashItem(name, slug) {
  const c = collection(name);
  const p = notePath(c, slug);
  if (!existsSync(p)) throw new Error("Not found");
  const dest = join(vaultRoot(), "_trash", c.folder, `${slug}-${Date.now()}.md`);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(p, dest);
}

// Saves an image (base64 data URL) as _assets/<dir>/<slug>.<ext>. An older file moves to _assets/_old/.
export function saveImage(name, slug, dataUrl) {
  const c = collection(name);
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(String(dataUrl));
  if (!m) throw new Error("image: must be a JPG, PNG or WebP");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 15 * 1024 * 1024) throw new Error("image: larger than 15 MB");
  const ext = m[1] === "png" ? "png" : m[1] === "webp" ? "webp" : "jpg";
  const rel = `_assets/${c.image.dir}/${slug}.${ext}`;
  const dest = join(vaultRoot(), rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) {
    const old = join(vaultRoot(), "_assets", "_old", `${Date.now()}-${slug}.${ext}`);
    mkdirSync(dirname(old), { recursive: true });
    renameSync(dest, old);
  }
  writeFileSync(dest, buf);
  return rel;
}
