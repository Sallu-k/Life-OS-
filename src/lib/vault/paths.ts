import path from "node:path";

// The vault location. Set VAULT_PATH in .env.local; defaults to the fake sample vault.
export function vaultRoot(): string {
  return path.resolve(process.cwd(), process.env.VAULT_PATH || "./sample-vault");
}
