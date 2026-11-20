"use client";

import { useState } from "react";
import { dayLabel } from "@/lib/format";
import { MIN_DAYS, type AreaBalance } from "@/lib/vault/balance";
import { BalanceChart } from "./BalanceChart";
import { PeriodPicker, type Period } from "./PeriodPicker";

export interface BalancePeriod extends Period {
  balance: AreaBalance[];
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

// The balance graph for a chosen month (or all time), with what went into each area's number.
export function BalanceExplorer({ periods, initial }: { periods: BalancePeriod[]; initial: string }) {
  const [key, setKey] = useState(initial);
  const period = periods.find((p) => p.key === key) ?? periods[periods.length - 1];
  if (!period) return null;
  const balance = period.balance;
  const empty = balance.every((b) => b.value === null);

  return (
    <>
      <PeriodPicker periods={periods} value={period.key} onChange={setKey} />

      <section aria-labelledby="balance-heading" className="card system-window mt-6 p-5 sm:p-8">
        <h2 id="balance-heading" className="mb-1 font-serif text-2xl text-ink">
          Life areas · {period.label}
        </h2>
        <p className="mb-6 text-sm text-ink-dim">
          Each habit is scored on its own (done 1, half 0.5, showed up 0.25, not done 0; not applicable and no entry left out), then an area is the average of its
          habits. Knowledge &amp; Self also counts reading (10+ pages done, fewer half); Fun counts weeks with a trip, outing or game. An area needs {MIN_DAYS}+ recorded days.
        </p>
        {empty && <p className="mb-4 text-sm text-ink-dim">No entries yet for this period. Log your days in Daily/ (see the Daily template) and they appear here.</p>}
        <BalanceChart balance={balance} />
      </section>

      <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
        {balance.map((b) => (
          <section key={b.area.id} aria-labelledby={`area-${b.area.id}`}>
            <h3 id={`area-${b.area.id}`} className="ornament mb-3 flex items-baseline gap-3 font-serif text-xl text-ink">
              {b.area.label}
              <span className="text-sm text-ink-dim">{b.value === null ? b.reason : pct(b.value)}</span>
            </h3>
            {b.parts.length === 0 && b.items.length === 0 && b.achievements.length === 0 && <p className="text-sm text-ink-dim">Nothing recorded in this period.</p>}
            {b.parts.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1.5 text-sm">
                {b.parts.map((part) => (
                  <li key={part.label} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate">{part.label}</span>
                    <span className="balance-track block flex-1" aria-hidden="true">
                      <span className="balance-fill" style={{ width: `${Math.round((part.value ?? 0) * 100)}%`, display: "block" }} />
                    </span>
                    <span className="w-28 shrink-0 text-right text-xs text-ink-dim">
                      {pct(part.value)} · {part.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {b.items.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1 text-sm text-ink-dim">
                {b.items.slice(0, 8).map((item, i) => (
                  <li key={i}>
                    {item.label}: {item.text}
                  </li>
                ))}
                {b.items.length > 8 && <li>and {b.items.length - 8} more</li>}
              </ul>
            )}
            {b.achievements.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-ink-dim">
                {b.achievements.map((a) => (
                  <li key={a.slug}>
                    ✦ {a.title} <time dateTime={a.date}>· {dayLabel(a.date, true)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
