// Creates a new game note from a title. Poster and banner come from Steam (no key needed);
// if Steam has no match and RAWG_API_KEY is set in .env.local, RAWG's image is used as the banner.
// Usage: npm run add-game -- "Outer Wilds" "PC"
import { existsSync } from "node:fs";
import { join } from "node:path";
import { steamImages, steamSearch } from "./lib/steam.mjs";
import { downloadNew, fail, getJson, loadEnvLocal, readTemplate, setField, slugify, vaultRoot, writeNew, fallbackSlug } from "./lib/vault-write.mjs";

loadEnvLocal();
const [title, platform = ""] = process.argv.slice(2).map((a) => a.trim());
if (!title) fail('Usage: npm run add-game -- "title" ["platform"]');

const slug = slugify(title) || fallbackSlug("game");
const notePath = join(vaultRoot(), "Collections", "Games", `${slug}.md`);
if (existsSync(notePath)) fail(`Already exists, not overwritten: ${notePath}`);

let posterUrl = null;
let backdropUrl = null;
const match = await steamSearch(title).catch(() => null);
if (match) {
  console.log(`Steam match: ${match.name} (app ${match.appid}). If that is the wrong game, delete the images and pick them by hand.`);
  ({ poster: posterUrl, backdrop: backdropUrl } = await steamImages(match.appid).catch(() => ({ poster: null, backdrop: null })));
} else if (process.env.RAWG_API_KEY) {
  const result = await getJson(`https://api.rawg.io/api/games?key=${encodeURIComponent(process.env.RAWG_API_KEY)}&search=${encodeURIComponent(title)}&page_size=1`);
  backdropUrl = result.results?.[0]?.background_image ?? null;
} else {
  console.log("Steam found nothing and there is no RAWG_API_KEY: the note has no images (a placeholder will show).");
}

const poster = posterUrl ? await downloadNew(posterUrl, `_assets/posters/${slug}`) : null;
const backdrop = backdropUrl ? await downloadNew(backdropUrl, `_assets/backdrops/${slug}`) : null;

let note = readTemplate("Game").replace("{{title}}", () => title);
note = setField(note, "title", title);
note = setField(note, "platform", platform);
note = setField(note, "poster", poster);
note = setField(note, "backdrop", backdrop);
writeNew(notePath, note);
console.log(`Created: ${notePath}`);
if (!platform) console.log('Reminder: fill in "platform" in the note; the site skips games without one.');
console.log("Tip: add released, developer, publisher and genres in the note for a richer page.");
