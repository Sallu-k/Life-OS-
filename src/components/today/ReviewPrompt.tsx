"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { shiftWeek, thisWeek } from "@/lib/week";

// From Saturday to Monday, a gentle nudge to do the weekly review (on Monday: the week that just ended),
// until that week has one; and the weekly money check ("how much is left?") when none was made in 6 days.
export function ReviewPrompt() {
  const [week, setWeek] = useState<string | null>(null);
  const [money, setMoney] = useState(false);
  useEffect(() => {
    const day = new Date().getDay(); // 0 Sunday … 6 Saturday
    if (![6, 0, 1].includes(day)) return;
    const id = day === 1 ? shiftWeek(thisWeek(), -1) : thisWeek();
    api<{ done: boolean }>(`review/${id}`).then((r) => !r.done && setWeek(id), () => undefined);
    api<{ lastCheck: { date: string } | null }>("money/current").then(
      (m) => setMoney(!m.lastCheck || (Date.now() - new Date(`${m.lastCheck.date}T12:00:00`).getTime()) / 864e5 >= 6),
      () => undefined,
    );
  }, []);
  return (
    <>
      {week && (
        <Link href={`/review/#${week}`} className="day-state review-prompt">
          <span aria-hidden="true">🗒</span>
          <span className="flex-1">The week is ending: take five minutes for your weekly review.</span>
          <span className="chip edit-primary">Review →</span>
        </Link>
      )}
      {money && (
        <Link href="/review/#money" className="day-state review-prompt">
          <span aria-hidden="true">🪙</span>
          <span className="flex-1">Weekly money check: how much do you have left? One number, no counting.</span>
          <span className="chip edit-primary">Check →</span>
        </Link>
      )}
    </>
  );
}
