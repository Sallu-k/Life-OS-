"use client";

import { useEffect, useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { keptCopy, readKept, saveOrQueue } from "@/lib/offline";
import { dayLabel } from "@/lib/format";
import { localToday } from "@/components/today/types";

// What GET /api/money answers (scripts/lib/money.mjs).
export interface MoneyMonth {
  month: string;
  incomes: { date: string; label: string; amount: number }[];
  checks: { date: string; left: number }[];
  totalIn: number;
  lastCheck: { date: string; left: number } | null;
  periods: { from: string; to: string; cost: number; came: number }[];
  currency: string; // ISO code like "EUR", or "" for plain numbers
}

// An amount in the currency chosen on this card (Settings `money.currency`), or a plain number.
function money(n: number, currency: string): string {
  try {
    return currency ? new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return n.toLocaleString();
  }
}

// Money without counting every purchase: what came in this month, and once a week how much is
// left. What the days in between cost is worked out from those. Charity is never recorded here.
export function Money() {
  const month = localToday().slice(0, 7);
  const path = `money/${month}`;
  const [m, setM] = useState<MoneyMonth | null>(() => null);
  const [left, setLeft] = useState("");
  const [inAmount, setInAmount] = useState("");
  const [inLabel, setInLabel] = useState("");
  const currency = m?.currency ?? "";
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setM(keptCopy<MoneyMonth>(path));
    readKept<MoneyMonth>(path).then(({ data }) => data && setM(data), (e: Error) => setMsg(e.message));
  }, [path]);

  async function add(body: Record<string, unknown>, done: string) {
    try {
      const { data, queued } = await saveOrQueue<MoneyMonth>("money/add", { date: localToday(), ...body });
      if (data) setM(data);
      feel("saved");
      setMsg(queued ? `${done} Saved on this phone; it goes to the PC when it is reachable.` : done);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function remove(kind: "in" | "left", date: string, index: number) {
    if (!confirm("Remove this entry?")) return;
    try {
      const { data } = await saveOrQueue<MoneyMonth>("money/remove", { kind, date, index });
      if (data) setM(data);
      feel("remove");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const checkedThisWeek = m?.lastCheck && (Date.now() - new Date(`${m.lastCheck.date}T12:00:00`).getTime()) / 864e5 < 6;
  return (
    <section className="card flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="money-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="money-heading" className="font-serif text-xl text-ink">
          Money
        </h2>
        <span className="text-xs text-ink-dim">Private · never on the site · no purchase-by-purchase counting</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-ink-dim">Money in this month</span>
          <span className="font-serif text-2xl text-ink">{m ? money(m.totalIn, currency) : "—"}</span>
          <ul className="flex flex-col gap-1 text-sm">
            {(m?.incomes ?? []).map((x, i, all) => (
              <li key={`${x.date}-${i}`} className="flex items-center gap-2">
                <span className="text-ink-dim">{dayLabel(x.date, true)}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{x.label}</span>
                <span className="text-ink">{money(x.amount, currency)}</span>
                <button type="button" className="px-1 text-ink-dim hover:text-ink" aria-label={`Remove ${x.label}`} onClick={() => remove("in", x.date, all.slice(0, i).filter((y) => y.date === x.date).length)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!inAmount) return;
              void add({ kind: "in", amount: Number(inAmount), label: inLabel || "Money in" }, "Added.");
              setInAmount("");
              setInLabel("");
            }}
          >
            <input className="today-input w-28" type="number" inputMode="decimal" min={0} placeholder="Amount" value={inAmount} onChange={(e) => setInAmount(e.target.value)} aria-label="Amount that came in" />
            <input className="today-input min-w-0 flex-1" placeholder="From (scholarship, pocket money…)" value={inLabel} onChange={(e) => setInLabel(e.target.value)} aria-label="From" />
            <button type="submit" className="chip">
              Add
            </button>
          </form>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-ink-dim">Weekly check</span>
          <p className="text-sm text-ink-dim">
            {checkedThisWeek ? `Checked on ${dayLabel(m!.lastCheck!.date, true)}: ${money(m!.lastCheck!.left, currency)} left.` : "Once a week: how much do you have now (cash and bank)? No need to count what you bought."}
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (left === "") return;
              void add({ kind: "left", left: Number(left) }, "Saved.");
              setLeft("");
            }}
          >
            <input className="today-input w-36" type="number" inputMode="decimal" min={0} placeholder="Left now" value={left} onChange={(e) => setLeft(e.target.value)} aria-label="How much is left now" />
            <button type="submit" className="chip edit-primary">
              Save check
            </button>
          </form>
          <ul className="flex flex-col gap-1 text-sm">
            {(m?.periods ?? [])
              .slice(-4)
              .reverse()
              .map((p) => (
                <li key={p.to} className="flex items-center gap-2">
                  <span className="text-ink-dim">
                    {dayLabel(p.from, true)} – {dayLabel(p.to, true)}
                  </span>
                  <span className="ml-auto text-ink">cost {money(Math.max(0, p.cost), currency)}</span>
                </li>
              ))}
            {m && m.checks.length > 0 && (m.periods.length === 0) && <li className="text-ink-dim">Next week's check shows what this week cost.</li>}
          </ul>
          {(m?.checks ?? []).length > 0 && (
            <details className="text-xs text-ink-dim">
              <summary className="cursor-pointer">Checks this month</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {m!.checks.map((c) => (
                  <li key={c.date} className="flex items-center gap-2">
                    {dayLabel(c.date, true)}: {money(c.left, currency)}
                    <button type="button" className="px-1 hover:text-ink" aria-label="Remove check" onClick={() => remove("left", c.date, 0)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-dim">
        Currency
        <input
          className="today-input w-20 py-1 uppercase"
          maxLength={3}
          defaultValue={currency}
          key={currency}
          placeholder="EUR"
          aria-label="Currency code"
          onBlur={async (e) => {
            const code = e.target.value.trim().toUpperCase();
            if (code === currency || (code && !/^[A-Z]{3}$/.test(code))) return;
            await saveOrQueue("settings", { money: { currency: code } }).catch(() => undefined);
            if (m) setM({ ...m, currency: code });
          }}
        />
        (a 3-letter code like USD, EUR, INR; empty for plain numbers)
      </label>
      {msg && <p className="text-xs text-ink-dim">{msg}</p>}
    </section>
  );
}
