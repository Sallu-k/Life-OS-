// The key that signs the phone app's live updates. The private half never leaves this PC
// (%LOCALAPPDATA%/LifeOS/update-key.pem, made on first use); the public half is built into the APK
// (scripts/build-app.mjs, lifeos-pc.json "updateKey"), and the app installs only updates signed with it,
// so nobody on the same Wi-Fi can slip their own code into the app. Keep the file with the signing key.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = () => join(process.env.LIFEOS_KEY_DIR || join(process.env.LOCALAPPDATA || homedir(), "LifeOS"), "update-key.pem");

let cached = null;
function privateKey() {
  if (cached) return cached;
  if (!existsSync(file())) {
    const { privateKey } = generateKeyPairSync("ed25519");
    mkdirSync(join(file(), ".."), { recursive: true });
    writeFileSync(file(), privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  }
  cached = createPrivateKey(readFileSync(file()));
  return cached;
}

// The public key as base64 (SubjectPublicKeyInfo DER), the form Java's X509EncodedKeySpec reads.
export const publicUpdateKey = () => createPublicKey(privateKey()).export({ type: "spki", format: "der" }).toString("base64");

// { signed: "<the manifest JSON>", sig: "<Ed25519 signature of exactly those bytes, base64>" }
export function signManifest(manifest) {
  const signed = JSON.stringify(manifest);
  return { signed, sig: sign(null, Buffer.from(signed, "utf8"), privateKey()).toString("base64") };
}
