// Runs automatically after `npm run build` (the "postbuild" script).
//
// Next.js writes small navigation data files named like "__next.games.__PAGE__.txt".
// On Windows it creates folders instead ("__next.games\__PAGE__.txt"), so the browser's requests
// for the dotted names fail and every link falls back to a slower full page load.
// This script renames those files to the dotted names. It only touches the generated out/ folder.
import { existsSync, readdirSync, renameSync, rmdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const out = resolve(process.cwd(), "out");
let moved = 0;

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

function removeEmptyDirs(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) removeEmptyDirs(p);
  }
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

function fix(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const file of filesUnder(p)) {
        const flat = name + "." + relative(p, file).split(sep).join(".");
        renameSync(file, join(dir, flat));
        moved++;
      }
      removeEmptyDirs(p);
    } else {
      fix(p);
    }
  }
}

if (existsSync(out)) {
  fix(out);
  if (moved > 0) console.log(`[fix-export-segments] Renamed ${moved} navigation data files for static hosting.`);
}
