// Copies <vault>/_assets into public/vault-assets so the site can show covers, posters and certificates.
// Runs automatically before `npm run dev` and `npm run build`. Never writes to the vault.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();
const vault = resolve(process.cwd(), process.env.VAULT_PATH || "./sample-vault");
const from = resolve(vault, "_assets");
const to = resolve(process.cwd(), "public/vault-assets");

rmSync(to, { recursive: true, force: true });
if (!existsSync(from)) {
  console.log(`[sync-assets] No _assets folder in ${vault}; skipping (placeholders will be used).`);
} else {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[sync-assets] Copied ${from} -> public/vault-assets`);
}
