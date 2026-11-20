"use client";

// Phone app only: fetch site updates from the PC (see android/.../LiveUpdatePlugin.java). Checked when
// the app opens and when it comes back to the front (at most every 5 minutes). When an update has been
// downloaded, a "lifeos-update-ready" event lets the page offer a restart; otherwise it shows on the
// next launch by itself.
import { getServerUrl, getToken, isApp, loadBundledPc } from "./api";

interface LiveUpdate {
  check(o: { url: string; token: string }): Promise<{ updated: boolean; version: string; downloaded?: number }>;
  apply(): Promise<void>;
  info(): Promise<{ version: string; built: string; fromApk: boolean; ready: boolean }>;
}

// A Capacitor plugin object must never be the value of a promise (or the return value of an async
// function): the promise would ask it for `.then`, which Capacitor forwards to Android as a missing
// native method. So it stays in a plain box and is only used inside `withPlugin`.
let box: Promise<{ p: LiveUpdate }> | null = null;
async function withPlugin<T>(use: (p: LiveUpdate) => Promise<T>): Promise<T> {
  box ??= import("@capacitor/core").then(({ registerPlugin }) => ({ p: registerPlugin<LiveUpdate>("LiveUpdate") }));
  return use((await box).p);
}

const LAST = "lifeos-update-checked";
let running = false;

export async function checkForUpdate(force = false): Promise<string> {
  if (!isApp() || running) return "";
  try {
    if (!force && Date.now() - Number(sessionStorage.getItem(LAST) ?? 0) < 5 * 60_000) return "";
    sessionStorage.setItem(LAST, String(Date.now()));
  } catch {
    // No session storage: just check.
  }
  running = true;
  try {
    await loadBundledPc();
    const url = getServerUrl();
    if (!url) return "No PC address yet.";
    const r = await withPlugin((p) => p.check({ url, token: getToken() }));
    if (r.updated) {
      window.dispatchEvent(new Event("lifeos-update-ready"));
      return `Update downloaded (${r.downloaded ?? 0} files changed).`;
    }
    return "LifeOS is up to date.";
  } catch (e) {
    return `Could not check: ${(e as Error).message}`; // PC off or away from home: try again later
  } finally {
    running = false;
  }
}

export async function applyUpdate(): Promise<void> {
  try {
    sessionStorage.removeItem("lifeos-started"); // the restarted app opens on Today
  } catch {
    // Opens on Home instead.
  }
  await withPlugin((p) => p.apply());
}

export async function appVersion(): Promise<{ version: string; built: string; fromApk: boolean; ready: boolean } | null> {
  if (!isApp()) return null;
  try {
    return await withPlugin((p) => p.info());
  } catch {
    return null;
  }
}
