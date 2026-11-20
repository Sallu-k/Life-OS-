"use client";

// Finding the PC from the phone app, with no typing:
// 1. `npm run app:android` writes the PC's addresses and token into the app (/lifeos-pc.json).
// 2. If none of those answers (the router gave the PC a new address), scan the home network for a
//    LifeOS server: every 192.168.x.1-254 next to the known address, a few at a time.
import { getServerUrls, loadBundledPc, setServerUrls } from "./api";

export { loadBundledPc };

async function isLifeOS(origin: string, timeout: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${origin}/api/health`, { signal: controller.signal, cache: "no-store" });
    const body = (await res.json()) as { app?: string };
    return body.app === "lifeos";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Tries the known addresses, then scans. Saves what it finds and returns it (or null).
export async function connectToPc(onProgress?: (text: string) => void): Promise<string | null> {
  await loadBundledPc();
  const known = getServerUrls();
  for (const url of known) {
    onProgress?.(`Trying ${url}…`);
    if (await isLifeOS(url, 2500)) return save(url, known);
  }
  // Scan the /24 network around each known home address (Tailscale addresses do not change).
  const lan = known.map((u) => /^http:\/\/((\d+\.\d+\.\d+)\.\d+):(\d+)/.exec(u)).filter((m): m is RegExpExecArray => !!m && !m[1].startsWith("100."));
  const bases = [...new Set(lan.map((m) => `${m[2]}|${m[3]}`))];
  if (!bases.length) bases.push("192.168.1|4173", "192.168.0|4173");
  for (const base of bases) {
    const [net, port] = base.split("|");
    const hosts = Array.from({ length: 254 }, (_, i) => `http://${net}.${i + 1}:${port}`);
    for (let i = 0; i < hosts.length; i += 32) {
      onProgress?.(`Looking for the PC on ${net}.x (${Math.min(i + 32, 254)}/254)…`);
      const batch = hosts.slice(i, i + 32);
      const found = (await Promise.all(batch.map(async (h) => ((await isLifeOS(h, 1500)) ? h : null)))).find(Boolean);
      if (found) return save(found, known);
    }
  }
  return null;
}

function save(url: string, known: string[]): string {
  // Keep Tailscale addresses; put the working one first.
  setServerUrls([url, ...known.filter((u) => u !== url && /\/\/100\./.test(u))]);
  return url;
}
