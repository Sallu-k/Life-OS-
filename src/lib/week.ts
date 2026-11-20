// ISO weeks on the device (Monday to Sunday), matching scripts/lib/review.mjs.
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function weekIdOf(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4, 12);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 864e5));
  return `${thursday.getFullYear()}-W${pad(week)}`;
}

export function mondayOf(id: string): string {
  const [y, w] = id.split("-W").map(Number);
  const jan4 = new Date(y, 0, 4, 12);
  jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7);
  return ymd(jan4);
}

export function shiftWeek(id: string, n: number): string {
  const d = new Date(`${mondayOf(id)}T12:00:00`);
  d.setDate(d.getDate() + 7 * n);
  return weekIdOf(ymd(d));
}

export const thisWeek = () => weekIdOf(ymd(new Date()));
