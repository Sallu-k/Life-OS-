// A table of habits by month: each cell is tinted by how consistent the habit was that month
// (done 1, half 0.5, showed up 0.25). Empty when the habit was not tracked. No streaks, no targets.
import { habitScore, monthName, type DayData } from "@/lib/vault/history";

export function ConsistencyGrid({ habits, months, days, onPick }: { habits: { id: string; label: string }[]; months: string[]; days: DayData[]; onPick?(month: string): void }) {
  const byMonth = new Map(months.map((m) => [m, days.filter((d) => d.date.startsWith(m))]));
  return (
    <div className="consistency-wrap">
      <table className="consistency">
        <caption className="sr-only">Consistency of each habit by month</caption>
        <thead>
          <tr>
            <th scope="col">Habit</th>
            {months.map((m) => (
              <th key={m} scope="col" title={monthName(m)}>
                <button type="button" onClick={() => onPick?.(m)}>
                  {m.endsWith("-01") || m === months[0] ? monthName(m, true).replace(" ", " ") : monthName(m, true).slice(0, 3)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <th scope="row">{h.label}</th>
              {months.map((m) => {
                const { value, days: counted } = habitScore(byMonth.get(m) ?? [], h.id);
                const label = value === null ? `${monthName(m)}: not tracked` : `${monthName(m)}: ${Math.round(value * 100)}% · ${counted} days`;
                return (
                  <td key={m} title={label} aria-label={label}>
                    {value !== null && <span className="consistency-cell" style={{ "--v": `${Math.round(10 + value * 85)}%` } as React.CSSProperties} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
