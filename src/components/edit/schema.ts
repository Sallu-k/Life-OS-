// The editor's form for each collection: which fields, in what order, with what input.
// Must match what scripts/lib/collections.mjs accepts.

export type Collection = "books" | "games" | "certificates" | "achievements";

export type Input =
  | { kind: "text"; long?: boolean }
  | { kind: "number"; min?: number; max?: number; step?: number }
  | { kind: "date" }
  | { kind: "month" }
  | { kind: "rating" }
  | { kind: "bool" }
  | { kind: "select"; options: [string, string][] }
  | { kind: "list" }
  | { kind: "section" }; // a "## Heading" in the note body

export interface Field {
  key: string;
  label: string;
  input: Input;
  hint?: string;
}

export const SCHEMA: Record<Collection, { label: string; image: { field: string; label: string; aspect: string }; fields: Field[] }> = {
  books: {
    label: "Book",
    image: { field: "cover", label: "Cover", aspect: "2 / 3" },
    fields: [
      { key: "title", label: "Title", input: { kind: "text" } },
      { key: "author", label: "Author", input: { kind: "text" } },
      { key: "status", label: "Status", input: { kind: "select", options: [["", "On the shelf"], ["unread", "To read"], ["reading", "Reading"], ["finished", "Finished"]] } },
      { key: "pages", label: "Pages", input: { kind: "number", min: 0 } },
      { key: "progress", label: "Current page", input: { kind: "number", min: 0 }, hint: "While reading" },
      { key: "started", label: "Started", input: { kind: "date" } },
      { key: "finished", label: "Finished", input: { kind: "month" } },
      { key: "rating", label: "My rating", input: { kind: "rating" } },
      { key: "opinion", label: "My opinion (one line)", input: { kind: "text" } },
      { key: "category", label: "Shelf", input: { kind: "text" } },
      { key: "published", label: "Published (year)", input: { kind: "number", min: 1000, max: 2100 } },
      { key: "isbn", label: "ISBN", input: { kind: "text" } },
      { key: "special", label: "A special copy", input: { kind: "bool" } },
      { key: "note", label: "Note (start with ⚠ to flag)", input: { kind: "text" } },
      { key: "Verdict", label: "Verdict", input: { kind: "section" } },
      { key: "Quotes", label: "Quotes", input: { kind: "section" } },
      { key: "Story of this copy", label: "Story of this copy", input: { kind: "section" } },
    ],
  },
  games: {
    label: "Game",
    image: { field: "poster", label: "Poster", aspect: "2 / 3" },
    fields: [
      { key: "title", label: "Title", input: { kind: "text" } },
      { key: "platform", label: "Platform", input: { kind: "text" } },
      { key: "status", label: "Status", input: { kind: "select", options: [["playing", "Playing"], ["finished", "Finished"], ["unfinished", "Unfinished"]] } },
      { key: "progress", label: "Progress %", input: { kind: "number", min: 0, max: 100 } },
      { key: "started", label: "Started", input: { kind: "date" } },
      { key: "finished", label: "Finished", input: { kind: "month" } },
      { key: "hours", label: "Hours played", input: { kind: "number", min: 0, step: 0.5 } },
      { key: "rating", label: "My rating", input: { kind: "rating" } },
      { key: "opinion", label: "My opinion (one line)", input: { kind: "text" } },
      { key: "moment", label: "The moment that stayed", input: { kind: "text" } },
      { key: "released", label: "Released (year)", input: { kind: "number", min: 1970, max: 2100 } },
      { key: "developer", label: "Developer", input: { kind: "text" } },
      { key: "publisher", label: "Publisher", input: { kind: "text" } },
      { key: "genres", label: "Genres (comma separated)", input: { kind: "list" } },
      { key: "series", label: "Series", input: { kind: "text" } },
      { key: "Verdict", label: "Verdict", input: { kind: "section" } },
    ],
  },
  certificates: {
    label: "Certificate",
    image: { field: "file", label: "Certificate image", aspect: "4 / 3" },
    fields: [
      { key: "title", label: "Title", input: { kind: "text" } },
      { key: "issuer", label: "Issuer", input: { kind: "text" } },
      { key: "date", label: "Date", input: { kind: "date" } },
      { key: "category", label: "Category", input: { kind: "select", options: [["academic", "Academic"], ["technical", "Technical"], ["event", "Event"], ["other", "Other"]] } },
      { key: "highlight", label: "Highlight", input: { kind: "bool" } },
    ],
  },
  achievements: {
    label: "Achievement",
    image: { field: "image", label: "Image", aspect: "4 / 3" },
    fields: [
      { key: "title", label: "Title", input: { kind: "text" } },
      { key: "date", label: "Date", input: { kind: "date" } },
      { key: "why", label: "Why it matters (one line)", input: { kind: "text" } },
      { key: "area", label: "Life area", input: { kind: "select", options: [["", "None"], ["health", "Health"], ["knowledge", "Learning"], ["work", "Work"], ["finance", "Money"], ["people", "People"], ["fun", "Fun"]] } },
    ],
  },
};
