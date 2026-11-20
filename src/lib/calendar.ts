// An optional second calendar beside the date (Settings, "Your day"), from the browser's own calendars.
// `offset` moves it by whole days, for places where the local date differs from the calculation
// (for example lunar calendars that follow local moon sighting).
export const CALENDARS: [string, string][] = [
  ["islamic-umalqura", "Islamic (Umm al-Qura)"],
  ["islamic-civil", "Islamic (civil)"],
  ["hebrew", "Hebrew"],
  ["chinese", "Chinese"],
  ["persian", "Persian"],
  ["indian", "Indian national"],
  ["buddhist", "Buddhist"],
  ["ethiopic", "Ethiopic"],
  ["coptic", "Coptic"],
  ["japanese", "Japanese"],
];

// Calendars whose months start with a sighted moon: Today asks around a month's end whether the date is right.
export const SIGHTED = new Set(["islamic-umalqura", "islamic-civil"]);

export interface CalendarDate {
  day: number;
  label: string; // e.g. "29 Jumada I 1448 AH"
}

export function calendarDate(date: string, calendar: string, offset = 0): CalendarDate | null {
  try {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + offset);
    const fmt = new Intl.DateTimeFormat(`en-u-ca-${calendar}-nu-latn`, { day: "numeric", month: "long", year: "numeric" });
    const day = Number(fmt.formatToParts(d).find((p) => p.type === "day")?.value);
    return { day, label: fmt.format(d) };
  } catch {
    return null; // a calendar this browser does not know
  }
}
