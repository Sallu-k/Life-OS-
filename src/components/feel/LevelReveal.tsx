"use client";

import { useEffect } from "react";
import { celebrate } from "@/lib/feel/motion";
import { feel } from "@/lib/feel/sounds";
import { milestoneOf } from "@/lib/vault/game";

const SEEN = "lifeos-seen-level";

// Shows the level-up (or milestone) moment once, the first time this device sees a higher level than
// before (e.g. after a day logged on the phone). The very first visit just remembers the level.
export function LevelReveal({ level }: { level: number }) {
  useEffect(() => {
    let seen = -1;
    try {
      seen = Number(localStorage.getItem(SEEN) ?? -1);
      localStorage.setItem(SEEN, String(Math.max(seen, level)));
    } catch {
      return;
    }
    if (seen < 0 || level <= seen) return;
    const milestone = milestoneOf(level) !== milestoneOf(seen);
    const timer = setTimeout(() => {
      feel(milestone ? "milestone" : "levelUp"); // silent if the browser has not allowed sound yet
      celebrate(`Level ${level}`, milestone ? "Milestone" : "Level up");
    }, 600);
    return () => clearTimeout(timer);
  }, [level]);
  return null;
}
