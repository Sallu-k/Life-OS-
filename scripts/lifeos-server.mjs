// The LifeOS server: serves the built site (the last good build, see lib/site.mjs) and a small API that edits the vault.
// Node built-ins plus gray-matter only. Usage: npm start   (or: node scripts/lifeos-server.mjs [port] [host])
//
// Safety: requests from this PC (127.0.0.1) may write. Anything else (the phone over Tailscale) must send
// the token from .env.local (LIFEOS_TOKEN) in an "Authorization: Bearer ..." header. Old files are backed
// up before every write; deletes go to _trash/. After writes the site is rebuilt in the background.
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, networkInterfaces } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { createGzip, gzipSync } from "node:zlib";
import { COLLECTIONS } from "./lib/collections.mjs";
import { addTask, capture, editTask, getDay, readHabits, readNotes, recordSleep, tasksIn, updateDay, writeHabits } from "./lib/days.mjs";
import { getPlan, readGoals, saveGoals } from "./lib/plan.mjs";
import { addMoney, getMoney, removeMoney } from "./lib/money.mjs";
import { getRewards } from "./lib/rewards.mjs";
import { gateBetween, gateInfo, logGate } from "./lib/gate.mjs";
import { library, logKnowledge, passages, saveQuote, session } from "./lib/knowledge.mjs";
import { createItem, getItem, listItems, saveImage, trashItem, updateItem } from "./lib/notes.mjs";
import { readSettings, writeSettings } from "./lib/settings.mjs";
import { getReview, saveReview, weekOf } from "./lib/review.mjs";
import { backupStatus, runBackup, setBackupDir, startBackups } from "./lib/backup.mjs";
import { startUsage } from "./lib/usage.mjs";
import { closeFinishedDays } from "./lib/days.mjs";
import { publish, siteRoot } from "./lib/site.mjs";
import { siteManifest, zipFiles } from "./lib/appBundle.mjs";
import { signManifest } from "./lib/updateKey.mjs";
import { loadEnvLocal, vaultRoot } from "./lib/vault-write.mjs";
import { offlinePack } from "./lib/offlinePack.mjs";

loadEnvLocal();
if (!process.env.LIFEOS_TOKEN) {
  process.env.LIFEOS_TOKEN = randomBytes(18).toString("base64url");
  appendFileSync(".env.local", `\nLIFEOS_TOKEN=${process.env.LIFEOS_TOKEN}\n`);
  console.log("Created a phone token in .env.local (LIFEOS_TOKEN).");
}
const TOKEN = process.env.LIFEOS_TOKEN;
const port = Number(process.argv[2] || 4173);
// Who may connect: this PC always; devices on the home Wi-Fi/LAN (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
// and on Tailscale (100.64-127.x.x) for the phone app. Anyone else is cut off at once. Other devices only
// get the API, with the token; the site pages are served to this PC alone. The server listens on every
// address, so a Wi-Fi that connects later or a new router address just works. Set LIFEOS_LAN=off in
// .env.local to allow Tailscale only, or pass a host as the second argument (e.g. 127.0.0.1) to listen there only.
const TAILSCALE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const LAN = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;
const LOOPBACK = /^(127\.|::1$)/;
const reachable = (ip) => TAILSCALE.test(ip) || (process.env.LIFEOS_LAN !== "off" && LAN.test(ip) && !ip.startsWith("192.168.56.")); // .56 = VirtualBox's own network
const plain = (ip = "") => ip.replace(/^::ffff:/, "");
const host = process.argv[3] || "0.0.0.0";
// The PC's own addresses the phone can use, worked out fresh on each request.
function phoneAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal && reachable(a.address))
    .map((a) => `http://${a.address}:${port}`);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".pdf": "application/pdf",
  ".woff2": "font/woff2",
};

// ---------- rebuild after edits ----------
// Today is live (it reads the API), so day and task changes only refresh the other pages after a minute
// of quiet; edits to books, games and the rest rebuild after 3 seconds. Build output goes to build.log.
const LOG_DIR = join(process.env.LOCALAPPDATA || homedir(), "LifeOS");
const BUILD_LOG = join(LOG_DIR, "build.log");
let building = false;
let again = false;
let timer = null;
let due = 0;
let quiet = false;
let lastBuild = { at: null, ok: true };
// A fast build (after a collection edit) is never pushed back; a quiet one waits for a minute without changes.
function scheduleBuild(delay = 3000) {
  if (process.env.LIFEOS_NO_REBUILD) return; // for tests on a copy of the vault
  const isQuiet = delay >= 60_000;
  if (timer && !quiet && (isQuiet || due <= Date.now() + delay)) return; // a sooner build is already planned
  clearTimeout(timer);
  quiet = isQuiet;
  due = Date.now() + delay;
  timer = setTimeout(() => ((timer = null), runBuild()), delay);
}
const scheduleQuietBuild = () => scheduleBuild(60_000);
function runBuild() {
  if (building) {
    again = true;
    return;
  }
  building = true;
  mkdirSync(LOG_DIR, { recursive: true });
  const log = createWriteStream(BUILD_LOG);
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("exit", (code) => {
    building = false;
    let ok = code === 0;
    if (ok) {
      try {
        ok = publish();
      } catch {
        ok = false;
      }
    }
    lastBuild = { at: new Date().toISOString(), ok };
    console.log(ok ? "Site rebuilt." : `Rebuild failed; the last good site stays up. Details: ${BUILD_LOG}`);
    if (again) {
      again = false;
      runBuild();
    }
  });
}

// ---------- static files ----------
function fileFor(urlPath, root) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (p.includes("\0")) return null;
  const full = resolve(join(root, p));
  if (full !== root && !full.startsWith(root + sep)) return null;
  try {
    if (existsSync(full) && statSync(full).isDirectory()) return existsSync(join(full, "index.html")) ? join(full, "index.html") : null;
  } catch {
    return null;
  }
  if (existsSync(full)) return full;
  if (existsSync(full + ".html")) return full + ".html";
  return null;
}

// Files under _next/static have a hash in their name, so the browser may keep them for good. Everything
// else is checked with a cheap ETag (304 when unchanged). Text files are gzipped.
const COMPRESS = new Set([".html", ".js", ".css", ".json", ".txt", ".svg"]);
function sendFile(req, res) {
  const root = siteRoot();
  const file = fileFor(req.url || "/", root);
  const notFound = join(root, "404.html");
  const target = file ?? (existsSync(notFound) ? notFound : null);
  if (!target) return res.writeHead(503, { "Content-Type": "text/plain" }).end("The site is being built. Try again in a minute.");
  let stat;
  try {
    stat = statSync(target);
  } catch {
    return res.writeHead(503, { "Content-Type": "text/plain" }).end("The site is being rebuilt. Try again in a moment.");
  }
  const ext = extname(target).toLowerCase();
  const etag = `"${stat.size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`;
  const headers = {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": (req.url || "").startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
    ETag: etag,
    Vary: "Accept-Encoding",
  };
  if (file && req.headers["if-none-match"] === etag) return res.writeHead(304, headers).end();
  const gzip = COMPRESS.has(ext) && stat.size > 1024 && /gzip/.test(String(req.headers["accept-encoding"] ?? ""));
  if (gzip) headers["Content-Encoding"] = "gzip";
  else headers["Content-Length"] = stat.size;
  const stream = createReadStream(target);
  stream.on("open", () => {
    res.writeHead(file ? 200 : 404, headers);
    if (req.method === "HEAD") {
      stream.destroy();
      res.end();
    } else if (gzip) stream.pipe(createGzip({ level: 5 })).pipe(res);
    else stream.pipe(res);
  });
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(503, { "Content-Type": "text/plain" }).end("The site is being rebuilt. Try again in a moment.");
    else res.destroy();
  });
}

// ---------- API ----------
const json = (res, status, body) =>
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        fail(new Error("Request too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        fail(new Error("Body must be JSON"));
      }
    });
    req.on("error", fail);
  });
}

// "This PC" means more than a loopback address: any website open in a browser on this PC also connects
// from 127.0.0.1. So a request only counts as this PC's own when it is addressed to 127.0.0.1/localhost
// (not a look-alike name pointing here: DNS rebinding) and does not come from another web page (Origin and
// Sec-Fetch-Site, which browsers always send for cross-site requests and pages cannot fake). LifeOS's own
// pages, the PC Gate and scripts pass; anything else needs the token like the phone does.
const SELF_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
function isLocal(req) {
  if (!LOOPBACK.test(plain(req.socket.remoteAddress))) return false;
  if (!SELF_HOST.test(String(req.headers.host ?? ""))) return false;
  const origin = req.headers.origin;
  if (origin && !SELF_ORIGINS.has(String(origin).toLowerCase())) return false;
  const site = req.headers["sec-fetch-site"];
  return !site || site === "same-origin" || site === "none";
}
const SELF_ORIGINS = new Set(["127.0.0.1", "localhost", "[::1]"].map((h) => `http://${h}:${port}`));
// The phone app's pages come from its own origin (Capacitor): only it may read API answers in a browser.
const APP_ORIGINS = new Set(["http://localhost", "https://localhost", "capacitor://localhost"]);

// The token check compares in constant time, and a device that sends a wrong token 10 times is
// locked out for 15 minutes (guessing the 24-character token is hopeless anyway).
const failures = new Map();
function tokenOk(req) {
  const ip = req.socket.remoteAddress ?? "";
  const f = failures.get(ip);
  if (f && f.count >= 10 && Date.now() - f.at < 15 * 60_000) return false;
  const sent = Buffer.from(String(req.headers.authorization ?? ""));
  const want = Buffer.from(`Bearer ${TOKEN}`);
  const ok = sent.length === want.length && timingSafeEqual(sent, want);
  if (ok) failures.delete(ip);
  else if (req.headers.authorization) failures.set(ip, { count: (f && Date.now() - f.at < 15 * 60_000 ? f.count : 0) + 1, at: Date.now() });
  return ok;
}
const allowed = (req) => isLocal(req) || tokenOk(req);

async function api(req, res, parts) {
  const [name, slug] = parts;
  const method = req.method;
  if (name === "health") {
    if (!allowed(req)) return json(res, 200, { ok: true, app: "lifeos", local: false, token: false });
    return json(res, 200, {
      ok: true,
      app: "lifeos", // lets the phone app recognise this PC when it looks for it on the network
      vault: vaultRoot().split(/[\\/]/).pop(),
      building,
      lastBuild,
      local: isLocal(req),
      token: true,
      game: readSettings().game,
      day: readSettings().day,
      ...(isLocal(req) ? { addresses: phoneAddresses() } : {}),
    });
  }
  if (!allowed(req)) return json(res, 401, { error: "Token needed. Enter it on the Settings page." });
  // ---------- phone app live updates (only files of the current site, never anything else) ----------
  // After `npm run app:android`: show the very build that went into the APK on the PC too (this PC only).
  if (name === "app" && slug === "publish" && method === "POST") {
    if (!isLocal(req)) return json(res, 403, { error: "Only from this PC" });
    const ok = publish();
    return json(res, ok ? 200 : 409, ok ? { version: siteManifest(siteRoot(), { cacheIt: false }).version } : { error: "out/ is not a complete build" });
  }
  // Signed, so the app can tell this PC's updates from anything else on the network.
  if (name === "app" && slug === "manifest" && method === "GET") return json(res, 200, signManifest(siteManifest(siteRoot(), { cacheIt: siteRoot().includes(".site") })));
  if (name === "app" && slug === "files" && method === "POST") {
    const root = siteRoot();
    const { files } = siteManifest(root, { cacheIt: root.includes(".site") });
    const wanted = (await readBody(req)).paths;
    if (!Array.isArray(wanted) || wanted.some((p) => typeof p !== "string" || !(p in files))) return json(res, 400, { error: "Unknown file" });
    const zip = zipFiles(root, wanted);
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length, "Cache-Control": "no-store" });
    return res.end(zip);
  }
  // Everything the app can show, in one answer, kept on the phone for when the PC is away (src/lib/pack.ts).
  if (name === "app" && slug === "offline" && method === "GET") {
    const body = JSON.stringify(offlinePack(localToday()));
    if (!/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) return res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(body);
    const zipped = gzipSync(body); // ~3 MB of JSON becomes ~0.1 MB over Wi-Fi
    return res.writeHead(200, { "Content-Type": "application/json", "Content-Encoding": "gzip", "Content-Length": zipped.length, "Cache-Control": "no-store" }).end(zipped);
  }
  // ---------- weekly review (private answers, like the journal) ----------
  if (name === "review" && method === "GET") return json(res, 200, getReview(slug && slug !== "current" ? slug : weekOf(localToday()).id));
  if (name === "review" && method === "PUT" && slug) return json(res, 200, saveReview(slug, await readBody(req)));
  // ---------- vault backup (this PC only for changes) ----------
  if (name === "backup" && method === "GET") return json(res, 200, backupStatus());
  if (name === "backup" && (method === "POST" || method === "PUT")) {
    if (!isLocal(req)) return json(res, 403, { error: "Only from this PC" });
    if (method === "PUT") return json(res, 200, setBackupDir((await readBody(req)).dir));
    return json(res, 200, runBackup());
  }
  if (name === "settings" && method === "GET") return json(res, 200, readSettings());
  if (name === "settings" && method === "PUT") {
    const settings = writeSettings(await readBody(req));
    scheduleBuild();
    return json(res, 200, settings);
  }

  if (name === "rebuild" && method === "POST") {
    scheduleBuild();
    return json(res, 202, { ok: true });
  }
  // ---------- Today: day, tasks, habits, capture ----------
  if (name === "day" && slug) {
    const date = slug === "today" ? localToday() : slug;
    if (method === "GET") return json(res, 200, withGate(getDay(date)));
    if (method === "PUT") {
      const day = withGate(updateDay(date, await readBody(req)));
      scheduleQuietBuild();
      return json(res, 200, day);
    }
  }
  // Ticked on a Gate (phone or PC): found by its text, as queued changes are (POST: the Gates' queues only post).
  if (name === "task" && slug === "done" && method === "POST") {
    const body = await readBody(req);
    editTask(body.date, findTask(body.date, { matchText: String(body.matchText ?? "") }), { done: true });
    scheduleQuietBuild();
    return json(res, 200, { ok: true });
  }
  if (name === "task" && method === "POST") {
    const body = await readBody(req);
    const date = body.date ?? localToday();
    addTask(date, body);
    scheduleQuietBuild();
    return json(res, 201, /^\d{4}-\d{2}-\d{2}$/.test(date) ? withGate(getDay(date)) : { tasks: tasksIn(date) });
  }
  if (name === "task" && method === "PUT") {
    const body = await readBody(req);
    editTask(body.date, findTask(body.date, body), body);
    scheduleQuietBuild();
    return json(res, 200, { ok: true });
  }
  // ---------- Plan: tasks on their dates, Someday, goals for the year/month/week ----------
  if (name === "plan" && method === "GET") {
    const query = new URL(req.url || "/", "http://x").searchParams;
    const from = query.get("from") || localToday();
    return json(res, 200, getPlan(from, query.get("to") || from));
  }
  if (name === "goals" && method === "GET" && slug) return json(res, 200, { goals: readGoals(slug, parts[2]) });
  if (name === "goals" && method === "PUT" && slug) {
    const [, scope, id] = parts;
    const goals = saveGoals(scope, id, (await readBody(req)).goals);
    if (scope !== "week") scheduleQuietBuild(); // month goals are quests on the site; week goals are private
    return json(res, 200, { goals });
  }
  // ---------- money (private), sleep measured by the phone, reward time ----------
  if (name === "money" && method === "GET") return json(res, 200, getMoney(slug && slug !== "current" ? slug : localToday().slice(0, 7)));
  if (name === "money" && method === "PUT" && slug === "add") return json(res, 200, addMoney(await readBody(req)));
  if (name === "money" && method === "PUT" && slug === "remove") return json(res, 200, removeMoney(await readBody(req)));
  if (name === "sleep" && method === "PUT") {
    const body = await readBody(req);
    const out = recordSleep(body.night, body, readSettings().sleep);
    scheduleQuietBuild();
    return json(res, 200, out);
  }
  if (name === "rewards" && method === "GET") return json(res, 200, getRewards(localToday()));
  if (name === "habits" && method === "GET") return json(res, 200, readHabits());
  if (name === "habits" && method === "PUT") {
    const list = writeHabits((await readBody(req)).habits);
    scheduleBuild();
    return json(res, 200, list);
  }
  // ---------- the Gate: "why are you using this?" on every unlock (counts only, never note text) ----------
  if (name === "gate" && method === "GET") return json(res, 200, gateInfo(localToday()));
  if (name === "gate" && method === "POST") {
    const body = await readBody(req, 256 * 1024);
    return json(res, 201, { saved: logGate(body.events ?? body) });
  }
  if (name === "notes" && method === "GET") return json(res, 200, { notes: readNotes() });
  // ---------- knowledge: cards and long reads (live only; some text is copyrighted) ----------
  if (name === "knowledge" && method === "GET" && slug === "session") {
    const n = Number(new URL(req.url || "/", "http://x").searchParams.get("n") || 3);
    return json(res, 200, session(localToday(), Math.max(1, Math.min(10, n))));
  }
  if (name === "knowledge" && method === "GET" && slug === "library") {
    // The books being read, for "Save a line" (their Quotes come back as cards).
    const reading = listItems("books").filter((b) => b.status === "reading").map((b) => ({ slug: b.slug, title: String(b.title) }));
    return json(res, 200, { ...library(localToday()), reading });
  }
  if (name === "knowledge" && method === "GET" && slug === "read" && parts[2]) {
    const query = new URL(req.url || "/", "http://x").searchParams;
    const from = query.has("from") ? Number(query.get("from")) : null;
    return json(res, 200, { passages: passages(parts[2], Number(query.get("n") || 5), 40, Number.isInteger(from) ? from : null) });
  }
  if (name === "knowledge" && method === "POST" && slug === "log") {
    const body = await readBody(req, 256 * 1024);
    return json(res, 201, { saved: logKnowledge(body.events ?? body) });
  }
  if (name === "knowledge" && method === "PUT" && slug === "current") {
    const body = await readBody(req);
    const book = String(body.book ?? "");
    if (!library(localToday()).books.some((b) => b.slug === book)) return json(res, 400, { error: "unknown long read" });
    return json(res, 200, { saved: logKnowledge({ kind: "current", id: book }) });
  }
  if (name === "knowledge" && method === "POST" && slug === "quote") {
    const body = await readBody(req);
    return json(res, 201, saveQuote(body.book, body.text));
  }
  if (name === "capture" && method === "POST") {
    const body = await readBody(req);
    return json(res, 201, { saved: capture(body.kind, body.text, body.title) });
  }

  if (name === "export" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="lifeos-${slug}.json"` });
    return res.end(JSON.stringify(listItems(slug), null, 2));
  }
  if (name === "import" && method === "POST") {
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    const existing = new Map(listItems(slug).map((i) => [String(i.title).toLowerCase(), i.slug]));
    const report = { created: [], updated: [], errors: [] };
    for (const item of items) {
      try {
        const match = item.slug && getItem(slug, item.slug) ? item.slug : existing.get(String(item.title ?? "").toLowerCase());
        const { slug: _s, ...changes } = item;
        if (body.dryRun) (match ? report.updated : report.created).push(item.title);
        else if (match) report.updated.push(updateItem(slug, match, changes).title);
        else report.created.push(createItem(slug, changes).title);
      } catch (err) {
        report.errors.push(`${item.title ?? "?"}: ${err.message}`);
      }
    }
    if (!body.dryRun && (report.created.length || report.updated.length)) scheduleBuild();
    return json(res, 200, report);
  }

  if (method === "GET" && !slug) return json(res, 200, listItems(name));
  if (method === "GET") {
    const item = getItem(name, slug);
    return item ? json(res, 200, item) : json(res, 404, { error: "Not found" });
  }
  if (method === "POST" && !slug) {
    const body = await readBody(req);
    const { image, ...changes } = body;
    let item = createItem(name, changes);
    if (image) item = updateItem(name, item.slug, { [imageField(name)]: saveImage(name, item.slug, image) });
    scheduleBuild();
    return json(res, 201, item);
  }
  if (method === "PUT" && slug) {
    const body = await readBody(req);
    const { image, ...changes } = body;
    if (image) changes[imageField(name)] = saveImage(name, slug, image);
    const item = updateItem(name, slug, changes);
    scheduleBuild();
    return json(res, 200, item);
  }
  if (method === "DELETE" && slug) {
    trashItem(name, slug);
    scheduleBuild();
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: "Not allowed" });
}

// A task is found by its text when given (safe for edits queued offline on the phone), else by index.
function findTask(date, body) {
  if (typeof body.matchText === "string") {
    const index = tasksIn(date).findIndex((t) => t.text === body.matchText);
    if (index === -1) throw new Error("task: not found (it may have been changed on another device)");
    return index;
  }
  return Number(body.index);
}

// A day as Today shows it, plus that day's Gate counts ("12 unlocks, 3 for fun").
const withGate = (day) => ({ ...day, gate: gateBetween(day.date, day.date) });

// Today on this PC (not UTC), as YYYY-MM-DD.
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const imageField = (name) => COLLECTIONS[name]?.image.field ?? "image";

const server = createServer(async (req, res) => {
  try {
    // Joined to a base as text: an address like "//" is a path here, not a host (it threw "Invalid URL").
    const url = new URL(`http://x${(req.url || "/").startsWith("/") ? req.url : "/"}`);
    // The phone app runs from its own origin, so the API allows cross-origin calls from it only (every one
    // still needs the token). Other websites get no CORS headers, so a browser never lets them read answers.
    if (url.pathname.startsWith("/api/")) {
      const origin = String(req.headers.origin ?? "");
      if (APP_ORIGINS.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      }
      if (req.method === "OPTIONS") return res.writeHead(204).end();
    }
    res.setHeader("X-Frame-Options", "DENY"); // no other page may show LifeOS inside a frame (clickjacking)
    if (url.pathname.startsWith("/api/")) {
      const parts = url.pathname.slice(5).split("/").filter(Boolean).map(decodeURIComponent);
      return await api(req, res, parts);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
    // The pages hold the whole site, so only this PC gets them; the phone app carries its own copy.
    if (!isLocal(req)) return res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("This address is only for the LifeOS phone app.");
    sendFile(req, res);
  } catch (err) {
    if (!res.headersSent) json(res, err?.status ?? 400, { error: err instanceof Error ? err.message : "Error" });
  }
});
server.on("connection", (socket) => {
  const ip = plain(socket.remoteAddress);
  if (!LOOPBACK.test(ip) && !reachable(ip)) socket.destroy();
});
server.on("error", (err) => {
  console.log(`Could not start on port ${port} (${err.code}).${err.code === "EADDRINUSE" ? " LifeOS is probably already running." : ""}`);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`LifeOS is at http://127.0.0.1:${port}/`);
  if (host === "0.0.0.0") for (const a of phoneAddresses()) console.log(`Phone app address: ${a}${TAILSCALE.test(a.slice(7)) ? "  (Tailscale)" : "  (same Wi-Fi)"}`);
});
console.log("Editing enabled · Ctrl+C to stop");

// Background jobs of the real server (test servers on a vault copy skip them): PC screen time, the
// weekly vault backup, and saving measured screen time when a day closes.
if (!process.env.LIFEOS_NO_REBUILD) {
  startUsage();
  startBackups();
  setTimeout(closeFinishedDays, 90_000);
  setInterval(closeFinishedDays, 3600_000);
}
