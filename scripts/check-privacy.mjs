// Privacy check: after `npm run build`, makes sure no private journal text from Daily notes
// ended up in out/. Only habit checkboxes and "> keep:" lines are allowed to be public.
// Prints file names and line numbers only, never the private text itself.
// Usage: npm run check-privacy
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEnvLocal, vaultRoot } from "./lib/vault-write.mjs";

loadEnvLocal();
const out = resolve(process.cwd(), "out");
const daily = join(vaultRoot(), "Daily");
if (!existsSync(out)) {
  console.error("No out/ folder. Run `npm run build` first.");
  process.exit(1);
}
if (!existsSync(daily)) {
  console.log("No Daily folder in the vault; nothing to check.");
  process.exit(0);
}

// All text the website contains (HTML pages and the data files Next.js uses for navigation).
function readAll(dir) {
  let text = "";
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) text += readAll(p);
    else if (/\.(html|txt|json|js)$/i.test(name)) text += readFileSync(p, "utf8");
  }
  return text;
}
const site = readAll(out);
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const escapeJson = (s) => JSON.stringify(s).slice(1, -1);

let leaks = 0;
let checked = 0;
for (const file of readdirSync(daily).filter((f) => f.toLowerCase().endsWith(".md"))) {
  const lines = readFileSync(join(daily, file), "utf8").split(/\r?\n/);
  let inFrontmatter = lines[0] === "---";
  let heading = "";
  lines.forEach((raw, i) => {
    if (i > 0 && inFrontmatter && raw === "---") {
      inFrontmatter = false;
      return;
    }
    if (inFrontmatter) return;
    if (/^##\s/.test(raw)) heading = raw.replace(/^##\s+/, "").trim().toLowerCase();
    if (heading === "fun") return; // the "## Fun" list is public by design (trips, outings, games)
    const line = raw.replace(/^\s*([-*+]\s+(\[.\]\s+)?|>\s*|#+\s*)/, "").trim();
    const allowed = /^\s*>\s*keep:/i.test(raw) || /^\s*[-*+]\s*\[.\]/.test(raw) || /^#/.test(raw.trim());
    if (allowed || line.length < 12) return; // short lines ("- Sample task") are too common to judge
    checked++;
    if ([line, escapeHtml(line), escapeJson(line)].some((v) => site.includes(v))) {
      leaks++;
      console.error(`LEAK: Daily/${file} line ${i + 1} appears in out/`);
    }
  });
}

if (leaks > 0) {
  console.error(`\n${leaks} private line(s) found in the built site. Do not share out/ until this is fixed.`);
  process.exit(1);
}
console.log(`Privacy check passed: ${checked} private journal lines checked, none appear in out/.`);
