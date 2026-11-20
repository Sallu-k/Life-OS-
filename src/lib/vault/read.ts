import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { vaultRoot } from "./paths";
import { assetPath, type Data } from "./validate";

// One note file, already parsed. `rel` is the path shown in warnings.
export interface Note {
  rel: string;
  slug: string;
  data: Data;
  body: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// "My Book.md" -> "my-book". Used only when a filename is not already kebab-case.
function toSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// YAML quietly turns an impossible date like 2026-02-30 into 2026-03-02. To catch such typos,
// bare dates in the frontmatter are quoted before parsing, so they stay as plain text
// and our own validators check them.
export function parseNote(raw: string): matter.GrayMatterFile<string> {
  const text = raw.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)/, (_all, open: string, yaml: string, close: string) => {
    const quoted = yaml.replace(/^(\s*[\w-]+:[ \t]*)(\d{4}-\d{2}-\d{2})[ \t]*$/gm, '$1"$2"');
    return open + quoted + close;
  });
  return matter(text);
}

// Reads every .md file in a vault folder. A file that cannot be parsed is skipped with a warning,
// so one broken note never stops the whole site from building.
export function readFolder(folder: string, type: string, warnings: string[]): Note[] {
  const dir = path.join(vaultRoot(), folder);
  if (!fs.existsSync(dir)) {
    warnings.push(`Folder not found: ${dir}`);
    return [];
  }

  const notes: Note[] = [];
  const seen = new Set<string>();
  for (const file of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md")).sort()) {
    const rel = path.join(folder, file);
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = parseNote(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch (err) {
      warnings.push(`${rel}: skipped, the frontmatter is not valid YAML (${firstLine(err)})`);
      continue;
    }

    const data = parsed.data as Data;
    if (data.type !== undefined && data.type !== type) {
      warnings.push(`${rel}: type is "${String(data.type)}", expected "${type}"; skipped`);
      continue;
    }

    const name = file.replace(/\.md$/i, "");
    const slug = SLUG.test(name) ? name : toSlug(name);
    if (slug === "") {
      warnings.push(`${rel}: skipped, rename the file using letters a-z, numbers and dashes`);
      continue;
    }
    if (slug !== name) warnings.push(`${rel}: filenames should be lowercase-with-dashes; using "${slug}"`);
    if (seen.has(slug)) {
      warnings.push(`${rel}: another note already uses the name "${slug}"; skipped`);
      continue;
    }
    seen.add(slug);
    notes.push({ rel, slug, data, body: parsed.content });
  }
  return notes;
}

// Like assetPath, but also checks that the file really exists in the vault.
// A missing file becomes null, so the site shows a placeholder instead of a broken image.
export function existingAsset(d: Data, key: string, problems: string[]): string | null {
  const p = assetPath(d, key, problems);
  if (p === null) return null;
  if (!fs.existsSync(path.join(vaultRoot(), p))) {
    problems.push(`${key}: file not found in the vault (${p}); showing a placeholder`);
    return null;
  }
  return p;
}

// During `next build`, every page asks for the same data. Load each collection once per build.
// In `next dev` nothing is cached, so edits in Obsidian show up on the next refresh.
const cache = new Map<string, unknown>();
export function once<T>(key: string, load: () => T): T {
  if (process.env.NODE_ENV !== "production") return load();
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key) as T;
}

function firstLine(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.split(/\r?\n/)[0];
}
