import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { vaultRoot } from "./paths";
import { ALL, type Stage } from "./certStages";

// The certificate stages from _system/certificates.md (see certStages.ts), or one wall for all.
export function loadCertStages(): Stage[] {
  const file = path.join(vaultRoot(), "_system", "certificates.md");
  try {
    const raw = fs.existsSync(file) ? matter(fs.readFileSync(file, "utf8")).data.stages : null;
    if (!Array.isArray(raw)) return ALL;
    const stages = raw
      .filter((s) => s && typeof s.name === "string" && s.name.trim())
      .map((s) => ({ name: String(s.name).trim(), until: /^\d{4}-\d{2}-\d{2}$/.test(String(s.until ?? "")) ? String(s.until) : "9999-12-31" }));
    return stages.length ? stages : ALL;
  } catch {
    return ALL;
  }
}
