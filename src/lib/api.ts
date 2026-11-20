"use client";

import { useEffect, useState } from "react";

// Talks to the LifeOS server (scripts/lifeos-server.mjs).
// - On the PC the site is served by that server, so the API is on the same address.
// - In the Android app the site is bundled inside the app, so the API is the PC's address over Tailscale,
//   saved on the Settings page (for example http://100.101.102.103:4173).
// When no server answers, every edit control stays hidden (or the app works offline, see lib/offline.ts).

const TOKEN_KEY = "lifeos-token";
const SERVER_KEY = "lifeos-server-url";

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value.trim());
  } catch {
    // Storage blocked: the value is needed again next time.
  }
}

export const getToken = () => read(TOKEN_KEY);
export const setToken = (token: string) => write(TOKEN_KEY, token);
// The phone app can know two PC addresses (home Wi-Fi and Tailscale), saved one per line. The one that
// answered last is tried first.
const GOOD_KEY = "lifeos-server-good";
export const getServerUrls = () => read(SERVER_KEY).split(/[\s,]+/).map((u) => u.replace(/\/+$/, "")).filter(Boolean);
export const setServerUrls = (urls: string[]) => write(SERVER_KEY, urls.map((u) => u.trim()).filter(Boolean).join(" "));
export const getServerUrl = () => {
  const urls = getServerUrls();
  const good = read(GOOD_KEY);
  return urls.includes(good) ? good : (urls[0] ?? "");
};

// The PC details built into the phone app by `npm run app:android` (/lifeos-pc.json), used when nothing
// is saved yet, so a fresh install connects without typing. Read once.
let bundled: Promise<void> | null = null;
export function loadBundledPc(): Promise<void> {
  if (getServerUrls().length && getToken()) return Promise.resolve();
  bundled ??= fetch("/lifeos-pc.json", { cache: "no-store" })
    .then((r) => r.json() as Promise<{ urls?: string[]; token?: string }>)
    .then((b) => {
      if (!getServerUrls().length && b.urls?.length) setServerUrls(b.urls);
      if (!getToken() && b.token) setToken(b.token);
    })
    .catch(() => undefined);
  return bundled;
}

// True inside the Android app (Capacitor), where pages are served by the app itself.
export function isApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { androidBridge?: unknown; Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.androidBridge || w.Capacitor?.isNativePlatform?.());
}

// The same for use while rendering: false on the first render (as in the built HTML), then the real value.
export function useIsApp(): boolean {
  const [app, setApp] = useState(false);
  useEffect(() => setApp(isApp()), []);
  return app;
}

const base = () => (isApp() ? getServerUrl() : "");
export const apiUrl = (path: string) => `${base()}/api/${path}`;

type Init = { method?: string; body?: unknown; timeout?: number; retry?: boolean }; // retry: ask even if the PC was just away

async function send<T>(origin: string, path: string, init: Init): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeout ?? 8000);
  try {
    const res = await fetch(`${origin}/api/${path}`, {
      method: init.method ?? "GET",
      headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// When the PC could not be reached, remember it for a short while: other reads then fail at once (and
// the app shows what is saved on the phone) instead of each waiting for its own timeout.
const AWAY_MS = 20_000;
let awayUntil = 0;
export const pcAway = () => Date.now() < awayUntil;
export function markPcBack() {
  awayUntil = 0;
}
if (typeof window !== "undefined") window.addEventListener("online", markPcBack);

const offlineError = () => Object.assign(new Error("The PC is not reachable right now."), { name: "Offline" });

export async function api<T = unknown>(path: string, init: Init = {}): Promise<T> {
  if (!isApp()) return send<T>("", path, init);
  await loadBundledPc();
  const first = getServerUrl();
  if (!first) throw new Error("No PC address yet. Add it on the Settings page.");
  const order = [first, ...getServerUrls().filter((u) => u !== first)];
  const read = (init.method ?? "GET") === "GET";
  if (read && pcAway() && !init.retry) throw offlineError();
  try {
    if (read) {
      // Reads ask every known address at once (home Wi-Fi, Tailscale); the first answer wins.
      const tries = order.map((origin) => send<T>(origin, path, { timeout: 5000, ...init }).then((data) => ({ data, origin })));
      const won = await Promise.any(tries).catch((e: AggregateError) => {
        const refused = e.errors.find((x) => (x as { status?: number }).status);
        throw refused ?? e.errors[0];
      });
      write(GOOD_KEY, won.origin);
      awayUntil = 0;
      return won.data;
    }
    // Writes go to one address at a time, so a change is never sent twice.
    let last: unknown;
    for (const origin of order) {
      try {
        const data = await send<T>(origin, path, init);
        write(GOOD_KEY, origin);
        awayUntil = 0;
        return data;
      } catch (e) {
        last = e;
        // Try the next address only if this one was never reached (a timed-out write may have arrived).
        if ((e as { status?: number }).status || (e as Error).name === "AbortError") throw e;
      }
    }
    throw last;
  } catch (e) {
    if (!(e as { status?: number }).status) awayUntil = Date.now() + AWAY_MS;
    throw e;
  }
}

// A failed request because the PC could not be reached (as opposed to the server saying no).
export const isOffline = (e: unknown) => !(e as { status?: number }).status;

export interface Health {
  ok: boolean;
  vault: string;
  building: boolean;
  local: boolean;
  token?: boolean;
  lastBuild?: { at: string | null; ok: boolean };
  game?: boolean;
  day?: import("./anchors").DaySetup; // anchors and the second calendar ("Your day" in Settings)
  addresses?: string[];
}

export async function checkServer(): Promise<Health | false> {
  try {
    const h = await api<Health>("health", { timeout: 4000, retry: true });
    return h.ok ? h : false;
  } catch {
    return false;
  }
}

// null while checking, false when there is no LifeOS server (read-only site), else the server's health.
export function useServer(): Health | false | null {
  const [health, setHealth] = useState<Health | false | null>(null);
  useEffect(() => {
    let alive = true;
    checkServer().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);
  return health;
}

// Reads an image file as a data URL, scaled down so the longest side is at most `max` pixels.
export function readImage(file: File, max = 1400): Promise<string> {
  return new Promise((ok, fail) => {
    const reader = new FileReader();
    reader.onerror = () => fail(new Error("Could not read the image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => fail(new Error("Not an image"));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        ok(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
