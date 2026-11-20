// Live updates for the phone app (no reinstall): the app asks for the current site's file list, then
// downloads only the files that changed, as one zip. Node built-ins only (zlib for deflate and CRC-32).
//   siteManifest(dir) -> { version, files: { "path": "hash" } }   (same for the PC site and the APK)
//   zipFiles(dir, paths) -> Buffer                                 (a standard .zip)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

// Files only the phone app has (written by the build or by Capacitor): not part of the comparison,
// carried over by the app on each update.
const APP_ONLY = new Set(["app-manifest.json", "lifeos-pc.json", "cordova.js", "cordova_plugins.js"]);
const cache = new Map(); // dir -> manifest (a published site folder never changes)

function walk(dir, root = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, root, out);
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

// Each file's fingerprint is the start of its SHA-1. `version` changes whenever any file does.
export function siteManifest(dir, { cacheIt = true } = {}) {
  if (cacheIt && cache.has(dir)) return cache.get(dir);
  const files = {};
  for (const path of walk(dir).sort()) {
    if (APP_ONLY.has(path)) continue;
    files[path] = createHash("sha1").update(readFileSync(join(dir, path))).digest("hex").slice(0, 16);
  }
  const version = createHash("sha1").update(JSON.stringify(files)).digest("hex").slice(0, 12);
  let builtAt = 0; // from out/build-info.json (scripts/stamp-build.mjs): updates only move forward
  try {
    builtAt = JSON.parse(readFileSync(join(dir, "build-info.json"), "utf8")).builtAt ?? 0;
  } catch {
    // An old build without the stamp counts as oldest.
  }
  const manifest = { version, builtAt, built: basename(dir), files };
  if (cacheIt) cache.set(dir, manifest);
  return manifest;
}

// A zip with the given files (paths must come from the manifest). Already-compressed files (images,
// fonts, audio) are stored; text is deflated.
const STORE = /\.(png|jpe?g|webp|gif|ico|woff2?|wav|mp3|ogg|pdf|zip)$/i;
export function zipFiles(dir, paths) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const path of paths) {
    const data = readFileSync(join(dir, path));
    const store = STORE.test(path);
    const body = store ? data : deflateRawSync(data, { level: 6 });
    const name = Buffer.from(path, "utf8");
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(0, 10); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(store ? 0 : 8, 10);
    entry.writeUInt32LE(0, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(paths.length, 8);
  end.writeUInt16LE(paths.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}
