// The copy of the built site that the LifeOS server shows. `next build` writes out/; only after a build
// succeeds is out/ copied to .site/<time>/ and served from there. So a build that fails (or Windows
// holding a file open while out/ is rebuilt) never takes the running site down: the last good copy stays.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const OUT = resolve(process.cwd(), "out");
// LIFEOS_SITE_DIR lets a test server keep its copies apart from the real one's.
const SITE = resolve(process.cwd(), process.env.LIFEOS_SITE_DIR || ".site");
let live = null;

const complete = (dir) => existsSync(join(dir, "index.html")) && existsSync(join(dir, "_next"));
const copies = () => (existsSync(SITE) ? readdirSync(SITE).filter((d) => /^\d+$/.test(d)).sort() : []);

// Copies a finished out/ into a new served folder and removes older copies (keeping the one before, in
// case a page is still loading from it). Returns false if out/ is not a complete site.
export function publish() {
  if (!complete(OUT)) return false;
  mkdirSync(SITE, { recursive: true });
  const dest = join(SITE, String(Date.now()));
  cpSync(OUT, dest, { recursive: true });
  live = dest;
  for (const old of copies().slice(0, -2)) {
    try {
      rmSync(join(SITE, old), { recursive: true, force: true });
    } catch {
      // Still in use; removed after a later build.
    }
  }
  return true;
}

// The folder to serve: the newest good copy. At start, a newer complete out/ (e.g. after a manual
// `npm run build`) is published first.
export function siteRoot() {
  if (live) return live;
  const newest = copies().map((d) => join(SITE, d)).filter(complete).pop();
  const outTime = complete(OUT) ? statSync(join(OUT, "index.html")).mtimeMs : 0;
  const newestTime = newest ? statSync(join(newest, "index.html")).mtimeMs : 0;
  if (outTime > newestTime && publish()) return live;
  live = newest ?? OUT;
  return live;
}
