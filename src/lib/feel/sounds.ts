"use client";

// Every sound LifeOS makes, by meaning. One tonal family (D major pentatonic) so the whole app sounds
// like one thing; good things rise in pitch; frequent sounds are short and quiet, rare rewards are
// richer. There is no harsh "wrong" sound: a missed habit gets a soft, low tap (forgiving by design).
import { isApp } from "@/lib/api";
import { audio, renderOffline, sample, setMasterVolume, tone, type Sample } from "./audio";
import { getFeel } from "./settings";

// D major pentatonic notes (Hz).
const N = {
  D3: 146.83, A3: 220, D4: 293.66, Fs4: 369.99, A4: 440, B4: 493.88,
  D5: 587.33, E5: 659.25, Fs5: 739.99, A5: 880, B5: 987.77,
  D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760, B6: 1975.53, D7: 2349.32,
};

export type Feeling =
  | "tap" | "select" | "toggle" | "open" | "close"
  | "markDone" | "markHalf" | "markPartial" | "markMissed" | "markNa" | "unmark"
  | "taskAdd" | "taskDone" | "taskUndo" | "taskMove" | "remove"
  | "funStory" | "funCompetitive" | "funSeries" | "funMovie" | "funOther"
  | "saved" | "imported" | "finished" | "allDone" | "streak" | "levelUp" | "milestone";

const arp = (notes: number[], step: number, o: Parameters<typeof tone>[1] = {}) => notes.forEach((f, i) => tone(f, { ...o, at: (o.at ?? 0) + i * step }));
const tick = (s: Sample, gain = 0.4, rate = 1) => sample(s, { gain, rate });

const SOUNDS: Record<Feeling, () => void> = {
  tap: () => tick("tap", 0.35),
  select: () => tick("select", 0.3),
  toggle: () => tick("toggle", 0.1),
  open: () => tick("open", 0.22),
  close: () => tick("close", 0.07),

  // Habit marks: the better the mark, the brighter and higher.
  markDone: () => (tick("tap", 0.3), arp([N.A5, N.D6], 0.055, { dur: 0.32, gain: 0.13 })),
  markHalf: () => (tick("tap", 0.28), tone(N.Fs5, { dur: 0.26, gain: 0.17 })),
  markPartial: () => (tick("glass", 0.3), tone(N.D5, { dur: 0.2, gain: 0.07, type: "sine", shimmer: 0.1 })),
  markMissed: () => (tick("back", 0.1), tone(N.D4, { dur: 0.16, gain: 0.06, type: "sine", shimmer: 0, wet: 0.15 })),
  markNa: () => tick("select", 0.22, 0.9),
  unmark: () => tick("back", 0.11, 1.1),

  // Tasks.
  taskAdd: () => (tick("drop", 0.35), tone(N.A5, { at: 0.03, dur: 0.14, gain: 0.05, type: "sine" })),
  taskDone: () => (tick("tap", 0.32), tone(N.D6, { at: 0.03, dur: 0.42, gain: 0.12, glide: N.D6 * 1.002, bell: true })),
  taskUndo: () => tick("back", 0.11),
  taskMove: () => tick("select", 0.3, 1.08),
  remove: () => tick("back", 0.13, 0.92),

  // Fun: story games feel the biggest.
  funStory: () => (tick("drop", 0.3), arp([N.D5, N.Fs5, N.A5, N.D6], 0.06, { dur: 0.4, gain: 0.1 })),
  funCompetitive: () => (tick("drop", 0.3), arp([N.A5, N.E6], 0.04, { dur: 0.16, gain: 0.08, type: "square", shimmer: 0, wet: 0.1 })),
  funSeries: () => (tick("drop", 0.3), arp([N.Fs5, N.A5, N.D6], 0.07, { dur: 0.32, gain: 0.09, type: "sine" })),
  funMovie: () => (tick("drop", 0.3), arp([N.D5, N.A5, N.Fs6], 0.08, { dur: 0.45, gain: 0.08, type: "sine", wet: 0.5 })),
  funOther: () => (tick("drop", 0.3), arp([N.A5, N.D6], 0.06, { dur: 0.3, gain: 0.08 })),

  // Confirmations and rewards (rarer, so richer).
  saved: () => arp([N.A5, N.D6], 0.08, { dur: 0.3, gain: 0.08, type: "sine" }),
  imported: () => arp([N.D5, N.A5, N.D6], 0.09, { dur: 0.35, gain: 0.09, type: "sine" }),
  finished: () => (arp([N.D5, N.Fs5, N.A5, N.D6], 0.07, { dur: 0.5, gain: 0.1 }), tone(N.A6, { at: 0.3, dur: 0.9, gain: 0.06, bell: true, type: "sine" })),
  allDone: () => {
    [N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => tone(f, { at: i * 0.035, dur: 1.1, gain: 0.07, wet: 0.6 }));
    tone(N.Fs6, { at: 0.2, dur: 0.8, gain: 0.04, type: "sine", bell: true, wet: 0.7 });
  },
  streak: () => (tone(N.A6, { dur: 0.6, gain: 0.07, type: "sine", bell: true }), tone(N.D7, { at: 0.13, dur: 0.8, gain: 0.06, type: "sine", bell: true })),
  levelUp: () => {
    arp([N.D5, N.Fs5, N.A5, N.D6, N.Fs6], 0.075, { dur: 0.5, gain: 0.1 });
    [N.D5, N.A5, N.D6, N.Fs6].forEach((f) => tone(f, { at: 0.42, dur: 1.4, gain: 0.06, wet: 0.7 }));
    [N.B6, N.D7, N.A6].forEach((f, i) => tone(f, { at: 0.5 + i * 0.09, dur: 0.35, gain: 0.03, type: "sine", bell: true }));
  },
  milestone: () => {
    tone(N.D3, { dur: 1.6, gain: 0.12, type: "sine", glide: N.A3, shimmer: 0.4, wet: 0.5 });
    arp([N.A4, N.D5, N.Fs5, N.A5, N.D6], 0.09, { at: 0.15, dur: 0.6, gain: 0.08 });
    [N.D5, N.Fs5, N.A5, N.D6, N.A6].forEach((f) => tone(f, { at: 0.65, dur: 1.8, gain: 0.05, wet: 0.8 }));
    [N.D7, N.B6, N.A6, N.Fs6].forEach((f, i) => tone(f, { at: 0.8 + i * 0.08, dur: 0.5, gain: 0.025, type: "sine", bell: true }));
  },
};

// Vibration on the phone app: a tap is barely there, rewards have a little rhythm.
const BUZZ: Partial<Record<Feeling, number | number[]>> = {
  markDone: 14, markHalf: 10, markPartial: 8, markMissed: 6, taskDone: 16, taskAdd: 8,
  funStory: [12, 40, 18], funCompetitive: 10, funSeries: 10, funMovie: 10, funOther: 10,
  saved: 10, imported: [10, 40, 10], finished: [18, 50, 24], allDone: [20, 60, 20, 60, 30],
  streak: [14, 50, 22], levelUp: [24, 70, 24, 70, 40], milestone: [40, 80, 40, 80, 60],
};

// Plays a feeling: its sound (if sound is on) and, on the phone, a short vibration.
export function feel(name: Feeling): void {
  if (typeof document === "undefined" || document.hidden) return;
  const s = getFeel();
  try {
    if (s.sound && audio()) {
      setMasterVolume(s.volume);
      SOUNDS[name]();
    }
    const buzz = BUZZ[name];
    if (s.vibrate && buzz && isApp() && "vibrate" in navigator) navigator.vibrate(buzz);
  } catch {
    // Sound is a nicety; never let it break an input.
  }
  // The last few feelings, for testing.
  const w = window as unknown as { __feelLog?: string[] };
  w.__feelLog = [...(w.__feelLog ?? []).slice(-19), name];
}

// A rating star: each star a step higher on the scale, so 5 stars sound like a little climb.
export function feelStar(n: number): void {
  if (typeof document === "undefined" || document.hidden || !getFeel().sound || !audio()) return;
  setMasterVolume(getFeel().volume);
  const notes = [N.D5, N.E5, N.Fs5, N.A5, N.D6];
  sample("tick", { gain: 0.3, rate: 1 + n * 0.06 });
  tone(notes[Math.max(0, Math.min(4, n - 1))], { dur: 0.22, gain: 0.07, type: "sine", shimmer: 0.2 });
}

// Test hook (only with ?feeltest in the address): window.__renderFeel(name) -> { ms, peakDb } of the
// sound rendered offline at full volume, to check lengths and that nothing clips.
async function measure(name: Feeling): Promise<{ ms: number; peakDb: number }> {
  const buf = await renderOffline(() => SOUNDS[name]());
  const data = buf.getChannelData(0);
  let peak = 0;
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > peak) peak = v;
    if (v > 0.003) last = i;
  }
  return { ms: Math.round((last / buf.sampleRate) * 1000), peakDb: Math.round(20 * Math.log10(peak || 1e-9) * 10) / 10 };
}

// Starts audio on the first tap anywhere, so the very first sound is not late.
export function primeFeel(): void {
  if (location.search.includes("feeltest")) {
    const w = window as unknown as { __renderFeel?: typeof measure; __feelNames?: string[] };
    w.__renderFeel = measure;
    w.__feelNames = Object.keys(SOUNDS);
  }
  const start = () => {
    if (getFeel().sound) audio();
  };
  window.addEventListener("pointerdown", start, { once: true, capture: true });
  window.addEventListener("keydown", start, { once: true, capture: true });
}
