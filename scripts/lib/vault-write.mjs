// Shared helpers for the add-* import scripts.
// These scripts are the ONLY code allowed to write to the vault, and they only create NEW files.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const USER_AGENT = "lifeos-personal-script";

// Reads KEY=value lines from .env.local without overriding real environment variables.
export function loadEnvLocal() {
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function vaultRoot() {
  return resolve(process.cwd(), process.env.VAULT_PATH || "./sample-vault");
}

// "The Brass Orchard!" -> "the-brass-orchard"
export function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// For titles with no a-z letters (e.g. only Japanese): "game-2026-11-03-181500". Rename it any time.
export function fallbackSlug(kind) {
  const t = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
  return `${kind}-${today()}-${t}`;
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Uses <vault>/Templates/<name>.md if present, otherwise the copy in docs/vault-templates.
export function readTemplate(name) {
  const inVault = join(vaultRoot(), "Templates", `${name}.md`);
  const fallback = resolve(process.cwd(), "docs", "vault-templates", `${name}.md`);
  const text = readFileSync(existsSync(inVault) ? inVault : fallback, "utf8");
  return text.replace(/\{\{date:YYYY-MM-DD\}\}/g, today());
}

// Replaces one "key: ..." line in the frontmatter. Strings are quoted, lists become [..], null stays null.
export function setField(text, key, value) {
  const yaml = value === null || value === undefined ? "null" : typeof value === "string" || Array.isArray(value) ? JSON.stringify(value) : String(value);
  const line = new RegExp(`^${key}:.*$`, "m");
  if (!line.test(text)) throw new Error(`Template has no "${key}:" field`);
  return text.replace(line, () => `${key}: ${yaml}`); // a function, so "$" in titles is kept as-is
}

// Creates a new file. Refuses to overwrite anything that already exists.
export function writeNew(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, content, { flag: "wx" });
  } catch (err) {
    if (err.code === "EEXIST") fail(`Already exists, not overwritten: ${path}`);
    throw err;
  }
}

export async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return res.json();
}

// Downloads an image into the vault. Returns the vault-relative path, or null if it failed.
// The file extension follows the URL (.jpg, .png, .webp), so pass vaultRelative without one or with .jpg.
export async function downloadNew(url, vaultRelative) {
  const ext = (new URL(url).pathname.match(/\.(jpe?g|png|webp)$/i)?.[0] ?? ".jpg").toLowerCase();
  vaultRelative = vaultRelative.replace(/\.(jpe?g|png|webp)$/i, "") + ext;
  const dest = join(vaultRoot(), vaultRelative);
  if (existsSync(dest)) {
    console.log(`Image already exists, kept as is: ${dest}`);
    return vaultRelative;
  }
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    writeNew(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`Saved image: ${dest}`);
    return vaultRelative;
  } catch (err) {
    console.log(`Could not download image (${err.message}); the note will use a placeholder.`);
    return null;
  }
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}
