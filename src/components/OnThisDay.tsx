import { dayLabel } from "@/lib/format";

// "On this day": the line you kept on today's date in earlier years (the > keep: line of that day's note).
export function OnThisDay({ memories }: { memories: { date: string; years: number; lines: string[] }[] }) {
  if (memories.length === 0) return null;
  return (
    <section className="card on-this-day" aria-labelledby="otd-heading">
      <h2 id="otd-heading" className="eyebrow">
        On this day
      </h2>
      <ul className="flex flex-col gap-3">
        {memories.map((m) => (
          <li key={m.date} className="flex flex-col gap-1">
            <span className="text-xs text-ink-dim">
              {m.years === 1 ? "A year ago" : `${m.years} years ago`} · {dayLabel(m.date, true)}
            </span>
            {m.lines.map((l, i) => (
              <p key={i} className="font-serif text-lg leading-snug text-ink">
                &ldquo;{l}&rdquo;
              </p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
