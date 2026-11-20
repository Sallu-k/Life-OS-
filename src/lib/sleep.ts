// Last night's bedtime and wake time from the phone's screen on/off moments (DevicePlugin.screenEvents).
// The night is the longest time the screen stayed off that began after 20:00 the evening before and lasted
// at least 3 hours. Short checks of the phone during the night (up to 10 minutes on) do not split it.
export interface ScreenEvent {
  t: number; // milliseconds
  on: boolean;
}
export interface Night {
  bed: string; // "HH:MM"
  wake: string;
  hours: number; // asleep, without the minutes the screen was on in between
}

const MIN_NIGHT = 3 * 3600_000;
const SHORT_CHECK = 10 * 60_000;
const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// `midnight`: the start of the morning's date (local), in milliseconds.
export function nightFromEvents(events: ScreenEvent[], midnight: number): Night | null {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  // Screen-off stretches that ended with the screen coming on again.
  const offs: { from: number; to: number }[] = [];
  let off: number | null = null;
  for (const e of sorted) {
    if (!e.on) off ??= e.t;
    else if (off !== null) {
      offs.push({ from: off, to: e.t });
      off = null;
    }
  }
  // Join stretches separated by a short look at the phone.
  const merged: { from: number; to: number; awake: number }[] = [];
  for (const o of offs) {
    const last = merged.at(-1);
    if (last && o.from - last.to <= SHORT_CHECK) {
      last.awake += o.from - last.to;
      last.to = o.to;
    } else merged.push({ ...o, awake: 0 });
  }
  const evening = midnight - 4 * 3600_000; // 20:00 the day before
  const nights = merged.filter((m) => m.from >= evening && m.to - m.from >= MIN_NIGHT);
  if (!nights.length) return null;
  const best = nights.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
  return { bed: hhmm(best.from), wake: hhmm(best.to), hours: Math.round((best.to - best.from - best.awake) / 360000) / 10 };
}
