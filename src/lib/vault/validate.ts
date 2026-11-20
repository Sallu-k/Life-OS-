// Small, readable validators. Each returns a value, or pushes a message into `problems`.

export type Data = Record<string, unknown>;

export function isRealDate(ymd: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// YAML turns 2026-03-14 into a Date object; turn it back into a plain string.
export function dateToString(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

// Text fields may be written without quotes in YAML, e.g. `title: 1984` becomes a number.
function asText(v: unknown): string | null {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function reqString(d: Data, key: string, problems: string[]): string {
  const v = asText(d[key]);
  if (v === null || v === "") {
    problems.push(`${key}: required text is missing`);
    return "";
  }
  return v;
}

export function optString(d: Data, key: string, problems: string[]): string | null {
  const raw = d[key];
  if (raw === null || raw === undefined || raw === "") return null;
  const v = asText(raw);
  if (v === null) {
    problems.push(`${key}: must be text`);
    return null;
  }
  return v === "" ? null : v;
}

export function oneOf<T extends string>(d: Data, key: string, allowed: readonly T[], problems: string[]): T | null {
  const v = d[key];
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  problems.push(`${key}: must be one of ${allowed.join(", ")}`);
  return null;
}

// A whole number from 1 to 5. Accepts "4" as well as 4.
export function rating(d: Data, problems: string[]): number | null {
  const v = d.rating;
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v;
  if (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5) return n;
  problems.push("rating: must be a whole number from 1 to 5; ignored");
  return null;
}

// YYYY-MM. A full date (YYYY-MM-DD) is accepted and shortened to its month.
export function yearMonth(d: Data, key: string, problems: string[]): string | null {
  const v = dateToString(d[key]);
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v;
  if (typeof v === "string" && isRealDate(v)) return v.slice(0, 7);
  problems.push(`${key}: must look like YYYY-MM; ignored`);
  return null;
}

// A required real calendar date, YYYY-MM-DD. YAML dates are turned back into strings first.
export function reqDate(d: Data, key: string, problems: string[]): string {
  const v = dateToString(d[key]);
  if (typeof v === "string" && isRealDate(v)) return v;
  problems.push(`${key}: must be a real date like 2026-03-14`);
  return "";
}

export function bool(d: Data, key: string, problems: string[]): boolean {
  const v = d[key];
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  problems.push(`${key}: must be true or false; treated as false`);
  return false;
}

export function nonNegNumber(d: Data, key: string, problems: string[]): number | null {
  const v = d[key];
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  problems.push(`${key}: must be a number, 0 or more; ignored`);
  return null;
}

// A year like 2017 (from 1000 to next year, so old classics fit too).
export function year(d: Data, key: string, problems: string[]): number | null {
  const v = d[key];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" && /^\d{4}$/.test(v.trim()) ? Number(v) : v;
  const max = new Date().getFullYear() + 1;
  if (typeof n === "number" && Number.isInteger(n) && n >= 1000 && n <= max) return n;
  problems.push(`${key}: must be a year like 2017; ignored`);
  return null;
}

// A list of short texts, e.g. genres: [Action RPG, Open world]. A single text becomes a list of one.
export function textList(d: Data, key: string, problems: string[]): string[] {
  const v = d[key];
  if (v === null || v === undefined || v === "") return [];
  const items = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const item of items) {
    if ((typeof item === "string" && item.trim() !== "") || typeof item === "number") out.push(String(item).trim());
    else problems.push(`${key}: every item must be text; one was ignored`);
  }
  return out;
}

// Asset paths must be vault-relative: no "..", no drive letters, no leading slash, no URLs.
export function assetPath(d: Data, key: string, problems: string[]): string | null {
  const v = d[key];
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") {
    problems.push(`${key}: must be a path`);
    return null;
  }
  const bad = v.includes("..") || /^[a-zA-Z]:/.test(v) || v.startsWith("/") || v.startsWith("\\") || /^[a-z]+:\/\//i.test(v);
  if (bad) {
    problems.push(`${key}: must be a vault-relative path like _assets/covers/name.jpg`);
    return null;
  }
  return v.replace(/\\/g, "/");
}

// Returns the text under a "## Heading" until the next heading of the same or higher level.
export function section(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${heading}\\s*$`, "i").test(l));
  if (start === -1) return null;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  const text = out.join("\n").trim();
  return text === "" ? null : text;
}

// An optional area id, e.g. `area: health`. It must look like an id; whether it exists is checked later (balance.ts).
export function areaId(d: Data, problems: string[]): string | null {
  const raw = d.area;
  if (raw === null || raw === undefined || raw === "") return null;
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (/^[a-z0-9-]+$/.test(v)) return v;
  problems.push("area: must be an area id in lowercase letters, numbers or dashes; ignored");
  return null;
}

// An optional habit level: a whole number from 1 up. Set by hand, never worked out automatically.
export function level(d: Data, problems: string[]): number | null {
  const v = d.level;
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v;
  if (typeof n === "number" && Number.isInteger(n) && n >= 1) return n;
  problems.push("level: must be a whole number, 1 or more; ignored");
  return null;
}

// An optional real date (YYYY-MM-DD), or null.
export function optDate(d: Data, key: string, problems: string[]): string | null {
  const v = dateToString(d[key]);
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && isRealDate(v)) return v;
  problems.push(`${key}: must be a real date like 2026-03-14; ignored`);
  return null;
}
