"use client";

import { useEffect, useState } from "react";
import { useIsApp } from "@/lib/api";
import { getFeel, setFeel, type FeelSettings as Settings } from "@/lib/feel/settings";
import { feel, type Feeling } from "@/lib/feel/sounds";

const SAMPLES: [Feeling, string][] = [
  ["markDone", "Habit done"],
  ["taskDone", "Task done"],
  ["funStory", "Story game"],
  ["allDone", "All done today"],
  ["levelUp", "Level up"],
  ["milestone", "Milestone"],
];

// "Sound and feel" on the Settings page: on/off, volume, phone vibration, and a few sounds to try.
// Saved on this device only.
export function FeelSettings() {
  const app = useIsApp();
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => setS(getFeel()), []);
  if (!s) return null;
  const update = (changes: Partial<Settings>) => setS(setFeel(changes));

  return (
    <div className="card flex flex-col gap-4 p-5 text-sm">
      <h2 className="font-serif text-xl text-ink">Sound and feel</h2>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-5 w-5 accent-[var(--brass)]" checked={s.sound} onChange={(e) => (update({ sound: e.target.checked }), e.target.checked && feel("toggle"))} />
        <span className="text-ink">Sounds when you tick, add and save</span>
      </label>
      <label className="edit-field">
        <span>Volume · {Math.round(s.volume * 100)}%</span>
        <input type="range" min={0.1} max={1} step={0.05} value={s.volume} disabled={!s.sound} onChange={(e) => update({ volume: Number(e.target.value) })} onPointerUp={() => feel("markDone")} onKeyUp={() => feel("markDone")} />
      </label>
      {app && (
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-[var(--brass)]" checked={s.vibrate} onChange={(e) => update({ vibrate: e.target.checked })} />
          <span className="text-ink">Vibrate on the phone</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2" aria-label="Try the sounds">
        {SAMPLES.map(([name, label]) => (
          <button key={name} type="button" className="chip feel-press" disabled={!s.sound} onClick={() => feel(name)}>
            ▶ {label}
          </button>
        ))}
      </div>
      <p className="text-ink-dim">Sounds are made on this device (recorded taps are Kenney&rsquo;s free CC0 sounds); nothing is downloaded. Animations follow your system&rsquo;s &ldquo;reduce motion&rdquo; setting.</p>
    </div>
  );
}
