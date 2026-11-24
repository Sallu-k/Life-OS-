// Shapes of the data the website works with. All dates are plain strings.

// "shelf" = owned, no reading status set (the note leaves status empty).
export type BookStatus = "unread" | "reading" | "finished" | "shelf";
export type GameStatus = "playing" | "finished" | "unfinished" | "dropped"; // "dropped" kept for older notes
export type CertificateCategory = "academic" | "technical" | "event" | "other";

export interface Book {
  slug: string;
  title: string;
  author: string | null;
  status: BookStatus;
  rating: number | null; // 1-5, your own rating (any status)
  finished: string | null; // YYYY-MM
  started: string | null; // YYYY-MM-DD
  progress: number | null; // current page while reading
  opinion: string | null; // one line, your personal take
  isbn: string | null;
  cover: string | null; // vault-relative path, e.g. _assets/covers/x.jpg
  special: boolean;
  category: string | null; // shelf section, e.g. "Islamic Studies & Theology"
  published: number | null; // year of first publication
  pages: number | null;
  note: string | null; // one line, e.g. "Needs checking"
  verdict: string | null;
  quotes: string | null;
  copyStory: string | null;
}

export interface Game {
  slug: string;
  title: string;
  platform: string;
  status: GameStatus;
  rating: number | null;
  finished: string | null;
  started: string | null; // YYYY-MM-DD
  progress: number | null; // percent, 0-100
  opinion: string | null; // one line, your personal take
  poster: string | null; // portrait 2:3 image, e.g. _assets/posters/x.jpg
  backdrop: string | null; // wide banner image, e.g. _assets/backdrops/x.jpg
  released: number | null; // year of the first release
  developer: string | null;
  publisher: string | null;
  genres: string[];
  series: string | null;
  note: string | null; // one line, e.g. "Played free roam, not the story"
  moment: string | null;
  hours: number | null;
  verdict: string | null;
}

export interface Certificate {
  slug: string;
  title: string;
  issuer: string;
  date: string; // YYYY-MM-DD
  file: string | null;
  category: CertificateCategory;
  highlight: boolean;
}

export interface Achievement {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  why: string | null;
  image: string | null;
  area: string | null; // an area id from _system/areas.md
}

export interface HabitDefinition {
  id: string; // permanent
  label: string; // editable
  active: boolean;
  area: string | null; // an area id from _system/areas.md
  level: number | null; // set by hand, never automatic
  difficulty: "easy" | "medium" | "hard" | null; // for XP; null counts as medium
  days: string[] | null; // weekdays it is due (mon..sun), null = every day
  core: boolean; // one of the few most important habits: double XP, a weekly target (days out of 7)
  weekly: number | null;
}

// A part of life (health, work, ...). Ids are permanent, labels can change.
export interface Area {
  id: string;
  label: string;
  active: boolean;
}

// One habit on one day. In a daily note: [x] done, [/] half, [o] showed up (partial), [ ] missed, [-] not applicable.
// "unrecorded" means the habit has no line that day.
export type HabitState = "done" | "half" | "partial" | "missed" | "na" | "unrecorded";

// Result of reading a daily note. Contains NO private journal text.
export interface DailyRecord {
  date: string; // YYYY-MM-DD, taken from the filename
  habits: Record<string, HabitState>;
  keepLines: string[];
  productivity: number | null; // percent, as written in the journal
  screenTime: number | null; // hours
  pages: number | null; // pages read
  fun: string[]; // lines from the note's "## Fun" section (trips, outings, games): public by design
  tasksDone: number; // completed tasks in "## Tasks" (counts only, never the text)
  tasksHigh: number; // of those, high priority (⏫)
  mood: number | null; // 1-5 (Today's "How was the day?")
  sleep: number | null; // hours slept
  bedtime: string | null; // "HH:MM" went to sleep that evening (measured by the phone)
  boredMin: number | null; // longest phone-free stretch 08:00-22:00, minutes (measured by the phone)
  protein: number | null; // grams eaten that day (the Food tab's total; never which foods)
  missed: Record<string, string>; // habit id -> reason it was not done (tired, busy, ...)
}

// A month note from Journal/YYYY-MM.md: the month's goals (with how they went) and its ideas.
export type GoalStatus = "done" | "not" | "progress" | "none";
export interface MonthNote {
  month: string; // YYYY-MM
  goals: { status: GoalStatus; text: string }[];
  ideas: string[];
  fun: string[]; // "## Fun": trips, outings, games played (a line may start with a date)
  books: string[]; // "## Books": books read this month
}

export interface LoadResult<T> {
  items: T[];
  warnings: string[];
}
