// Kinds of fun logged on Today, stored as readable lines in the daily note's "## Fun" section:
//   - story game: (a title)            - competitive game: (a title)
//   - series: (a title)                 - movie: (a title)         - other: Beach day
// A line without a known prefix (older notes, month notes) counts as "other".
export type FunKind = "story" | "competitive" | "series" | "movie" | "other";

export interface FunKindInfo {
  id: FunKind;
  group: "Gaming" | "Media" | "Other";
  label: string; // shown on buttons and lists
  prefix: string; // written in the note
  xp: number; // game layer only; story games are worth the most
}

export const FUN_KINDS: FunKindInfo[] = [
  { id: "story", group: "Gaming", label: "Story", prefix: "story game", xp: 25 },
  { id: "competitive", group: "Gaming", label: "Competitive", prefix: "competitive game", xp: 10 },
  { id: "series", group: "Media", label: "Series", prefix: "series", xp: 15 },
  { id: "movie", group: "Media", label: "Movie", prefix: "movie", xp: 15 },
  { id: "other", group: "Other", label: "Other", prefix: "other", xp: 15 },
];

const byId = new Map(FUN_KINDS.map((k) => [k.id, k]));

export function funKind(id: FunKind): FunKindInfo {
  return byId.get(id) ?? FUN_KINDS[FUN_KINDS.length - 1];
}

export function parseFun(line: string): { kind: FunKindInfo; text: string } {
  const match = /^\s*([a-z ]+?)\s*:\s*(.*)$/i.exec(line);
  const kind = match && FUN_KINDS.find((k) => k.prefix === match[1].toLowerCase());
  return kind ? { kind, text: match[2].trim() } : { kind: funKind("other"), text: line.trim() };
}

export function formatFun(kind: FunKind, text: string): string {
  return `${funKind(kind).prefix}: ${text.trim()}`;
}

// Short label for lists, e.g. "Story game · (a title)".
export function funLabel(line: string): string {
  const { kind, text } = parseFun(line);
  const name = kind.group === "Gaming" ? `${kind.label} game` : kind.label;
  return text ? `${name} · ${text}` : name;
}
