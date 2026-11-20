"use client";

import { Chip } from "./Chip";

export interface Period {
  key: string; // "2024-08" or "all"
  label: string; // "August 2024" or "All time"
}

// Pick a month (grouped by year) or "All time". Years are chips; the months of the chosen year are a list.
export function PeriodPicker({ periods, value, onChange }: { periods: Period[]; value: string; onChange(key: string): void }) {
  const months = periods.filter((p) => p.key !== "all");
  const years = [...new Set(months.map((p) => p.key.slice(0, 4)))];
  const year = value === "all" ? null : value.slice(0, 4);

  return (
    <div className="flex flex-col gap-3 border-y border-ink-dim/10 py-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Year">
        {years.map((y) => (
          <Chip key={y} pressed={year === y} onClick={() => onChange(months.filter((p) => p.key.startsWith(y)).at(-1)!.key)}>
            {y}
          </Chip>
        ))}
        {periods.some((p) => p.key === "all") && (
          <Chip pressed={value === "all"} onClick={() => onChange("all")}>
            All time
          </Chip>
        )}
      </div>
      {year && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Months of ${year}`}>
          {months
            .filter((p) => p.key.startsWith(year))
            .map((p) => (
              <Chip key={p.key} pressed={value === p.key} onClick={() => onChange(p.key)}>
                {p.label.split(" ")[0].slice(0, 3)}
              </Chip>
            ))}
        </div>
      )}
    </div>
  );
}
