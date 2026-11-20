// Anchors: named times of your day that habits and tasks can follow ("Wake up" 06:30, "After work" 18:00).
// A habit with `after: "wake"` and `offset: 15` is due 15 minutes after the "wake" anchor. Anchors and the
// optional second calendar are set in Settings ("Your day") and kept in _system/settings.md as `day`.

export interface Anchor {
  id: string; // permanent, lowercase (used in habits and tasks)
  label: string;
  time: string; // "HH:MM"
}
export interface DaySetup {
  anchors: Anchor[];
  calendar: string | null; // a second calendar shown beside the date (src/lib/calendar.ts), or none
  calendarOffset: number; // days added to that calendar (-2..+2), for local differences
}

export const DEFAULT_SETUP: DaySetup = { anchors: [], calendar: null, calendarOffset: 0 };

// "06:30" moved by `offset` minutes, kept within the day.
export function hhmm(time: string, offset = 0): string {
  const [h, m] = time.split(":").map(Number);
  const t = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + offset));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export const anchorOf = (setup: DaySetup, id: string | undefined | null) => setup.anchors.find((a) => a.id === id);

// When a habit's reminder is on a date: `offset` minutes after its anchor, or its fixed time, or none.
export function habitTime(h: { time?: string; after?: string; offset?: number }, _date: string, setup: DaySetup = DEFAULT_SETUP): string | null {
  const anchor = anchorOf(setup, h.after);
  if (anchor) return hhmm(anchor.time, h.offset ?? 0);
  return h.time || null;
}

// "after-work+10" -> { id: "after-work", offset: 10 }. Ids may contain hyphens, so only a trailing
// signed number is the offset.
export function splitAfter(after: string): { id: string; offset: number } {
  const m = /^(.*?)([+-]\d{1,3})?$/.exec(after)!;
  return { id: m[1], offset: Number(m[2] ?? 0) };
}

// A task's time: its own, or "wake+15" (minutes after/before an anchor).
export function taskTime(t: { time?: string | null; after?: string | null }, date: string, setup?: DaySetup): string | null {
  if (t.after) {
    const { id, offset } = splitAfter(t.after);
    return habitTime({ after: id, offset }, date, setup);
  }
  return t.time || null;
}

// The setup from the PC's settings, remembered on the device so the phone works offline.
const KEY = "lifeos-day-setup";
export function savedSetup(fromServer?: DaySetup | null): DaySetup {
  try {
    if (fromServer) {
      localStorage.setItem(KEY, JSON.stringify(fromServer));
      return fromServer;
    }
    const saved = localStorage.getItem(KEY);
    return saved ? { ...DEFAULT_SETUP, ...(JSON.parse(saved) as DaySetup) } : DEFAULT_SETUP;
  } catch {
    return fromServer ?? DEFAULT_SETUP;
  }
}
