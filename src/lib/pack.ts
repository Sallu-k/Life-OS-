"use client";

// The offline pack: when the phone reaches the PC, it downloads everything the app can show (every day,
// the plan, weekly reviews, money months, habits, settings, notes, knowledge cards and the next parts of
// each long read) in one answer (GET /api/app/offline) and keeps it, so nothing needs the PC to be seen.
// Changes made offline still go through the outbox (src/lib/offline.ts) as before.
import type { Day } from "@/components/today/types";
import { api, isOffline } from "./api";
import { dropOldDays, flush, keepCopy, outbox, packReplace } from "./offline";
import { READ, type Passage } from "./knowledge";
import { savePlan, type Plan } from "./plan";

type Pack = { made: string; days: Record<string, Day>; kept: Record<string, unknown>; plan: Plan | null; passages: Record<string, Passage[]> };
export type PackInfo = { at: number; days: number; reads: number };

const INFO = "lifeos-pack";
export const PACKED = "lifeos-packed";
const EVERY = 3 * 60 * 60 * 1000; // a fresh pack at most every 3 hours (Settings can ask for one now)

export function packInfo(): PackInfo | null {
  try {
    return JSON.parse(localStorage.getItem(INFO) ?? "null") as PackInfo | null;
  } catch {
    return null;
  }
}

let running: Promise<PackInfo | null> | null = null;
// Returns the new pack's info, or null when it was not needed or the PC could not be reached.
export function refreshPack(force = false): Promise<PackInfo | null> {
  const last = packInfo();
  if (!force && last && Date.now() - last.at < EVERY) return Promise.resolve(null);
  running ??= (async () => {
    try {
      await flush(force);
      if (outbox().length) return null; // changes still waiting: the pack would be older than them
      const pack = await api<Pack>("app/offline", { timeout: 60_000, retry: force });
      if (outbox().length) return null; // something changed on the phone while it downloaded
      const entries: Record<string, unknown> = {};
      for (const [date, day] of Object.entries(pack.days)) entries[`day:${date}`] = day;
      for (const [book, list] of Object.entries(pack.passages)) entries[`read:${book}`] = list;
      await packReplace(entries);
      for (const [path, data] of Object.entries(pack.kept)) keepCopy(path, data);
      if (pack.plan) savePlan(pack.plan);
      dropOldDays();
      const info = { at: Date.now(), days: Object.keys(pack.days).length, reads: Object.keys(pack.passages).length };
      localStorage.setItem(INFO, JSON.stringify(info));
      localStorage.removeItem(READ); // the PC knows those parts now
      window.dispatchEvent(new Event(PACKED)); // Settings shows the new numbers
      return info;
    } catch (e) {
      if (force && !isOffline(e)) throw e;
      return null;
    } finally {
      running = null;
    }
  })();
  return running;
}
