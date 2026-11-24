// The food list for Today's Food tab (Build 26): _system/foods.md, frontmatter `foods:`, one entry per food
// with its home portion and estimated kcal / protein per portion. Editable in Obsidian or in the app.
// Until the file exists the starter list (foodsStarter.mjs) is used; the first save writes it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { backup } from "./days.mjs";
import { STARTER_FOODS } from "./foodsStarter.mjs";
import { slugify, vaultRoot } from "./vault-write.mjs";

const file = () => join(vaultRoot(), "_system", "foods.md");
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;

function clean(f) {
  const kcal = Number(f.kcal);
  const protein = Number(f.protein);
  return {
    id: String(f.id),
    name: String(f.name ?? f.id).trim().slice(0, 80),
    group: String(f.group ?? "Other").trim().slice(0, 40) || "Other",
    portion: String(f.portion ?? "1 portion").trim().slice(0, 60) || "1 portion",
    kcal: Number.isFinite(kcal) ? Math.round(Math.min(3000, Math.max(0, kcal))) : 0,
    protein: Number.isFinite(protein) ? Math.round(Math.min(300, Math.max(0, protein)) * 10) / 10 : 0,
  };
}

export function readFoods() {
  if (!existsSync(file())) return STARTER_FOODS;
  const list = matter(readFileSync(file(), "utf8")).data.foods;
  // A food typed in Obsidian without an id gets one from its name (the next save from the app keeps it).
  return (Array.isArray(list) ? list : [])
    .map((f) => (f && !f.id && f.name ? { ...f, id: slugify(String(f.name)).slice(0, 50) } : f))
    .filter((f) => f && ID.test(String(f.id)))
    .map(clean);
}

// Replaces the list. Ids are permanent (day notes name them); a new food gets an id from its name.
export function writeFoods(list) {
  if (!Array.isArray(list) || list.length > 2000) throw new Error("foods: must be a list");
  const hasId = (f) => f && ID.test(String(f.id ?? ""));
  const taken = new Set(list.filter(hasId).map((f) => String(f.id)));
  const seen = new Set();
  const out = list.map((f, i) => {
    if (!f || !String(f.name ?? "").trim()) throw new Error(`food ${i + 1}: needs a name`);
    let id = String(f.id ?? "");
    if (!hasId(f)) {
      const base = slugify(String(f.name)).slice(0, 50) || "food";
      id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      taken.add(id);
    }
    if (seen.has(id)) throw new Error(`food "${id}" is listed twice`);
    seen.add(id);
    return clean({ ...f, id });
  });
  // Day notes name foods by id, so a save may change and add foods but never drop one (it also stops an
  // old or empty copy from a device wiping the list). Remove a never-used food in Obsidian.
  const missing = readFoods().filter((f) => !seen.has(f.id));
  if (missing.length) throw new Error(`foods: ${missing.length} food(s) missing from the list (e.g. "${missing[0].name}"); reload and try again`);
  const note = existsSync(file()) ? matter(readFileSync(file(), "utf8")) : { data: { type: "foods" }, content: "\nFood list for Today's Food tab. Values are estimates per portion: fix them as you learn. Ids are permanent (day notes use them); rename with `name`.\n" };
  backup(file());
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), matter.stringify(note.content, { ...note.data, foods: out }));
  return readFoods();
}
