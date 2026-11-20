import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { vaultRoot } from "./paths";
import type { Area, LoadResult } from "./types";

// Reads the life areas from _system/areas.md. Ids are permanent; labels can change.
export function loadAreas(): LoadResult<Area> {
  const rel = path.join("_system", "areas.md");
  const file = path.join(vaultRoot(), rel);
  const warnings: string[] = [];
  if (!fs.existsSync(file)) {
    warnings.push(`File not found: ${file}`);
    return { items: [], warnings };
  }

  let raw: unknown;
  try {
    raw = matter(fs.readFileSync(file, "utf8")).data.areas;
  } catch {
    warnings.push(`${rel}: the frontmatter is not valid YAML; no areas loaded`);
    return { items: [], warnings };
  }
  if (!Array.isArray(raw)) {
    warnings.push(`${rel}: "areas" must be a list`);
    return { items: [], warnings };
  }

  const items: Area[] = [];
  raw.forEach((a: unknown, i: number) => {
    const entry = (a ?? {}) as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!/^[a-z0-9-]+$/.test(id)) {
      warnings.push(`${rel}: area #${i + 1} needs an id in lowercase letters, numbers or dashes; skipped`);
      return;
    }
    if (items.some((x) => x.id === id)) {
      warnings.push(`${rel}: area id "${id}" is listed twice; second one skipped`);
      return;
    }
    const label = typeof entry.label === "string" && entry.label.trim() !== "" ? entry.label.trim() : id;
    if (entry.active !== undefined && typeof entry.active !== "boolean") {
      warnings.push(`${rel}: area "${id}" active must be true or false; treated as true`);
    }
    items.push({ id, label, active: entry.active !== false });
  });
  return { items, warnings };
}
