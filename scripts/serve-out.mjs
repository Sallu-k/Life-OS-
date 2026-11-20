// Serves the built site in out/ with Node's built-in http module (no dependencies).
// Usage: node scripts/serve-out.mjs [port] [host]
// Default host is 127.0.0.1 (this PC only). Pass your Tailscale IP (100.x.y.z) to view it from your phone.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const root = resolve(process.cwd(), "out");
const port = Number(process.argv[2] || 4173);
const host = process.argv[3] || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
};

if (!existsSync(root)) {
  console.error("No out/ folder. Run `npm run build` first.");
  process.exit(1);
}

// Turns a URL into a file inside out/, or null. Never leaves out/.
function fileFor(urlPath) {
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

// While the nightly rebuild replaces out/, files can vanish between checking and reading.
// Every failure becomes a plain error response; the server itself never crashes.
function send(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const file = fileFor(req.url || "/");
  const notFound = join(root, "404.html");
  const target = file ?? (existsSync(notFound) ? notFound : null);
  if (!target) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  const stream = createReadStream(target);
  stream.on("open", () => {
    res.writeHead(file ? 200 : 404, {
      "Content-Type": TYPES[extname(target).toLowerCase()] || "application/octet-stream",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      stream.destroy();
      res.end();
    } else {
      stream.pipe(res);
    }
  });
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(503, { "Content-Type": "text/plain" }).end("The site is being rebuilt. Try again in a moment.");
    else res.destroy();
  });
}

createServer((req, res) => {
  try {
    send(req, res);
  } catch {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" }).end("Server error");
  }
}).listen(port, host, () => {
  console.log(`LifeOS is at http://${host}:${port}/  (Ctrl+C to stop)`);
});
