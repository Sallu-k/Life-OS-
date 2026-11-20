"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { feel } from "@/lib/feel/sounds";
import { useBackClose } from "@/lib/useBackClose";

// Phones only (hidden on wider screens by CSS): the four places used every day, plus "More".
// Thumb-reachable at the bottom, above the system navigation bar (safe-area padding).
const TABS = [
  { href: "/today/", label: "Today", icon: "M5 12.5l4.2 4.2L19 7" },
  { href: "/plan/", label: "Plan", icon: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h3M8 17h6" },
  { href: "/habits/", label: "Habits", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
  { href: "/areas/", label: "Life areas", icon: "M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9zM12 8l3.5 2v4L12 16l-3.5-2v-4z" },
];
const MORE = [
  { href: "/", label: "Home" },
  { href: "/knowledge/", label: "Knowledge" },
  { href: "/library/", label: "Library" },
  { href: "/games/", label: "Games" },
  { href: "/certificates/", label: "Certificates" },
  { href: "/achievements/", label: "Achievements" },
  { href: "/insights/", label: "Insights" },
  { href: "/review/", label: "Weekly review" },
  { href: "/settings/", label: "Settings" },
];

const current = (href: string, path: string) =>
  href === "/" ? path === "/" : href === "/library/" ? path.startsWith("/library") || path.startsWith("/books") : path.startsWith(href.replace(/\/$/, ""));

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
      <path d={d} />
    </svg>
  );
}

export function TabBar() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  // Android's Back closes the sheet first; a page picked in the sheet takes its place in the history.
  const leaving = useBackClose(open, () => setOpen(false));
  const inMore = MORE.some((m) => current(m.href, path));

  return (
    <>
      {open && (
        <div className="tab-sheet-backdrop" onClick={() => setOpen(false)}>
          <nav className="tab-sheet" aria-label="More" onClick={(e) => e.stopPropagation()}>
            {MORE.map((m) => (
              <Link key={m.href} href={m.href} replace className="tab-sheet-link" aria-current={current(m.href, path) ? "page" : undefined} onClick={() => (leaving(), feel("tap"))}>
                {m.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
      <nav className="tab-bar" aria-label="Main">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={current(t.href, path) ? "page" : undefined} onClick={() => feel("tap")}>
            <Icon d={t.icon} />
            <span>{t.label}</span>
          </Link>
        ))}
        <button type="button" className="tab" aria-expanded={open} aria-current={inMore ? "page" : undefined} onClick={() => (feel(open ? "close" : "open"), setOpen(!open))}>
          <Icon d="M6 12h.01M12 12h.01M18 12h.01" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
