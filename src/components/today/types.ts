// What /api/day/<date> returns (see scripts/lib/days.mjs).
export type Mark = "done" | "half" | "partial" | "missed" | "na";

export interface DayHabit {
  id: string;
  label: string;
  active: boolean;
  area?: string;
  days?: string | string[];
  time?: string;
  difficulty?: "easy" | "medium" | "hard";
  core?: boolean; // one of the few most important habits (double XP, weekly target)
  weekly?: number; // core habits: days out of 7
  target?: string;
  after?: string; // follows an anchor (Settings, "Your day"): its id
  offset?: number; // minutes after that anchor
  due: boolean;
  state: Mark | null;
  // Habit kinds (scripts/lib/days.mjs): which marks it offers, an amount a day, or parts at anchors of your day.
  marks?: Mark[]; // default: done, half, showed up, not done ("not applicable" is a long-press)
  unit?: string; // counted, e.g. "pages"
  goal?: number; // the daily amount that counts as done
  amount?: number | null;
  parts?: { id: string; label: string; anchor?: string }[]; // each at an anchor of your day (its id)
  partMarks?: Mark[]; // marks each part offers (default: done)
  partStates?: Record<string, Mark>;
}

export interface Task {
  done: boolean;
  text: string;
  time: string | null;
  priority: "high" | "medium" | "low" | null;
  repeat?: string | null; // e.g. "every week on Monday, Friday when done" (scripts/lib/tasks.mjs)
  deadline?: boolean; // ⚑: the date is the last day to get it done
  after?: string | null; // at an anchor: "wake", "wake+15", "lunch-10"
  start?: string | null; // 🛫 hidden from the lists until this date
  nag?: boolean; // 🔔 the reminder repeats until it is done
  note?: string;
  subtasks?: { done: boolean; text: string }[];
  doneOn?: string | null;
  index: number;
  date: string; // a day "YYYY-MM-DD", or "week:2026-W45", "month:2026-11", "someday"
}

export interface Day {
  date: string;
  exists: boolean;
  finished: string | null; // when Finish day was pressed ("YYYY-MM-DDTHH:MM")
  lockAt: string; // when the day stops taking changes (finished, or the next day at 12:00)
  locked: boolean;
  future: boolean; // not come yet: tasks only
  logged: Record<string, string>; // when each thing was first entered
  mood: number | null; // 1-5
  sleep: number | null; // hours
  bedtime?: string | null; // "HH:MM" went to bed this evening (measured by the phone, or typed)
  woke?: string | null; // "HH:MM" woke this morning
  played?: number; // minutes of reward time used today
  missed: Record<string, string>; // habit id -> reason
  reading?: { slug: string; title: string; progress: number; pages: number | null }[]; // books being read
  pagesBook?: string | null; // the book today's pages went to
  pcHours?: number | null; // measured on the PC (keyboard/mouse active)
  phoneHours?: number | null; // measured on the phone (Android usage access)
  gate?: { gates: number; fun: number; funMinutes: number }; // the Gate's counts for the day
  boredMin?: number | null; // longest phone-free stretch 08:00-22:00, minutes (measured on the phone)
  habits: DayHabit[];
  tasks: Task[];
  carried: Task[];
  productivity: number | null;
  screenTime: number | null;
  pages: number | null;
  journal: string;
  keep: string;
  fun: string[];
}

export const MARKS: { mark: Mark; icon: string; label: string }[] = [
  { mark: "done", icon: "✓", label: "Done" },
  { mark: "half", icon: "½", label: "Half done" },
  { mark: "partial", icon: "○", label: "Showed up" },
  { mark: "missed", icon: "✕", label: "Not done" },
  { mark: "na", icon: "–", label: "Not applicable" },
];

export const AREAS: [string, string][] = [
  ["", "No area"],
  ["health", "Health"],
  ["knowledge", "Learning"],
  ["work", "Work"],
  ["finance", "Money"],
  ["people", "People"],
  ["fun", "Fun"],
];

// Local calendar date as YYYY-MM-DD, moved by n days.
export function shift(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
