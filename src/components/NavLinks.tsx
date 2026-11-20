"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/today/", label: "Today" },
  { href: "/plan/", label: "Plan" },
  { href: "/knowledge/", label: "Knowledge" },
  { href: "/library/", label: "Library" },
  { href: "/games/", label: "Games" },
  { href: "/certificates/", label: "Certificates" },
  { href: "/achievements/", label: "Achievements" },
  { href: "/habits/", label: "Habits" },
  { href: "/areas/", label: "Life areas" },
  { href: "/insights/", label: "Insights" },
];

// A link is "current" on its own page and on pages below it (a book page counts as Library).
function isCurrent(href: string, path: string): boolean {
  if (href === "/") return path === "/";
  if (href === "/library/") return path.startsWith("/library") || path.startsWith("/books");
  return path.startsWith(href.replace(/\/$/, ""));
}

export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {LINKS.map((l) => (
        <li key={l.href} className="shrink-0">
          <Link href={l.href} className="nav-link" aria-current={isCurrent(l.href, path) ? "page" : undefined}>
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
