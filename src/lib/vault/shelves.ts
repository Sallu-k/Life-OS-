import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { vaultRoot } from "./paths";
import { UNSORTED_SHELF as UNSORTED } from "@/lib/format";
import type { Book } from "./types";

// The order of shelves on the Library page, from _system/library.md (`shelves: [...]`).
// The file is optional; without it, shelves are sorted alphabetically.
function preferredOrder(warnings: string[]): string[] {
  const rel = path.join("_system", "library.md");
  const file = path.join(vaultRoot(), rel);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = matter(fs.readFileSync(file, "utf8")).data.shelves;
    if (!Array.isArray(raw)) {
      warnings.push(`${rel}: "shelves" must be a list; using alphabetical order`);
      return [];
    }
    return raw.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim());
  } catch {
    warnings.push(`${rel}: the frontmatter is not valid YAML; using alphabetical order`);
    return [];
  }
}

// Every shelf that has books, in display order: listed shelves first, then others A-Z, then "Unsorted".
export function shelfOrder(books: Book[], warnings: string[]): string[] {
  const used = new Set(books.map((b) => b.category ?? UNSORTED));
  const listed = preferredOrder(warnings).filter((s) => used.has(s));
  const rest = [...used].filter((s) => !listed.includes(s) && s !== UNSORTED).sort((a, b) => a.localeCompare(b));
  return [...listed, ...rest, ...(used.has(UNSORTED) ? [UNSORTED] : [])];
}
