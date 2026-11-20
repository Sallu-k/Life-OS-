// Creates many game notes at once from a JSON list, with posters and banners from Steam
// (or the Wikipedia box art when Steam has none). Existing notes are skipped, never overwritten.
//
// Usage: npm run import-games -- path/to/games.json
// Each entry: { "title", "platform", "status", "released", "developer", "publisher", "genres": [],
//               "series", "note", "slug", "steam": <app id>, "wikipedia": "<article title>",
//               "posterFromWikipedia": true }   (only title, platform and status are required)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { steamImages, wikipediaImage } from "./lib/steam.mjs";
import { downloadNew, fail, loadEnvLocal, readTemplate, setField, slugify, vaultRoot, writeNew } from "./lib/vault-write.mjs";

const STATUSES = ["playing", "finished", "unfinished"];

loadEnvLocal();
const listPath = process.argv[2];
if (!listPath) fail("Usage: npm run import-games -- path/to/games.json");
const games = JSON.parse(readFileSync(listPath, "utf8"));
console.log(`Vault: ${vaultRoot()}\n`);

let created = 0;
let skipped = 0;
const noImage = [];

for (const g of games) {
  if (!g.title || !g.platform || !STATUSES.includes(g.status)) {
    console.log(`SKIP (needs title, platform and status ${STATUSES.join("/")}): ${JSON.stringify(g).slice(0, 80)}`);
    skipped++;
    continue;
  }
  const slug = g.slug || slugify(g.title);
  const notePath = join(vaultRoot(), "Collections", "Games", `${slug}.md`);
  if (existsSync(notePath)) {
    console.log(`exists, kept as is: ${slug}`);
    skipped++;
    continue;
  }

  // Find image URLs: Steam first, Wikipedia box art as the fallback (or when asked for).
  let posterUrl = null;
  let backdropUrl = null;
  try {
    if (g.steam) ({ poster: posterUrl, backdrop: backdropUrl } = await steamImages(g.steam));
    if (g.wikipedia && (g.posterFromWikipedia || !posterUrl)) posterUrl = (await wikipediaImage(g.wikipedia)) ?? posterUrl;
  } catch (err) {
    console.log(`  could not look up images for ${g.title} (${err.message})`);
  }
  const poster = posterUrl ? await downloadNew(posterUrl, `_assets/posters/${slug}`) : null;
  const backdrop = backdropUrl ? await downloadNew(backdropUrl, `_assets/backdrops/${slug}`) : null;
  if (!poster) noImage.push(g.title);

  let note = readTemplate("Game").replace("{{title}}", () => g.title);
  note = setField(note, "title", g.title);
  note = setField(note, "platform", g.platform);
  note = setField(note, "status", g.status);
  note = setField(note, "released", g.released ?? null);
  note = setField(note, "developer", g.developer ?? null);
  note = setField(note, "publisher", g.publisher ?? null);
  note = setField(note, "genres", g.genres ?? []);
  note = setField(note, "series", g.series ?? null);
  note = setField(note, "poster", poster);
  note = setField(note, "backdrop", backdrop);
  note = setField(note, "note", g.note ?? null);
  writeNew(notePath, note);
  console.log(`created: ${slug}${poster ? "" : "  (no poster, placeholder will show)"}`);
  created++;
  await new Promise((r) => setTimeout(r, 300)); // be gentle with Steam and Wikipedia
}

console.log(`\nDone: ${created} created, ${skipped} skipped.`);
if (noImage.length > 0) console.log(`No poster found for: ${noImage.join(", ")}`);
