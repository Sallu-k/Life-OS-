// Creates a new certificate note for a file that is already in <vault>/_assets/certs.
// Usage: npm run add-certificate -- "workshop.pdf" "Circuit Design Workshop" "Example University" technical
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { fail, loadEnvLocal, readTemplate, setField, slugify, vaultRoot, writeNew, fallbackSlug } from "./lib/vault-write.mjs";

const CATEGORIES = ["academic", "technical", "event", "other"];

loadEnvLocal();
const [fileArg, title, issuer = "", category = "other"] = process.argv.slice(2).map((a) => a.trim());
if (!fileArg || !title) fail('Usage: npm run add-certificate -- <file in _assets/certs> "title" ["issuer"] [academic|technical|event|other]');
if (!CATEGORIES.includes(category)) fail(`Category must be one of: ${CATEGORIES.join(", ")}`);

const fileName = basename(fileArg);
const file = `_assets/certs/${fileName}`;
if (!existsSync(join(vaultRoot(), file))) fail(`File not found: ${join(vaultRoot(), file)}. Put the file in _assets/certs first.`);

const slug = slugify(title) || fallbackSlug("certificate");
const notePath = join(vaultRoot(), "Collections", "Certificates", `${slug}.md`);

let note = readTemplate("Certificate").replace("{{title}}", () => title);
note = setField(note, "title", title);
note = setField(note, "issuer", issuer);
note = setField(note, "file", file);
note = setField(note, "category", category);
writeNew(notePath, note);
console.log(`Created: ${notePath}`);
if (!issuer) console.log('Reminder: fill in "issuer" in the note; the site skips certificates without one.');
