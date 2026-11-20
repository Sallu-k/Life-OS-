import Link from "next/link";
import { NavLinks } from "./NavLinks";
import { QuickAddButton } from "./QuickAddButton";

// Wider screens: logo and links in one row. Phones: just the logo (the bottom tab bar navigates).
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-8 sm:py-3.5">
        <Link href="/" className="flex items-center gap-2 rounded-sm">
          <span className="text-brass" aria-hidden="true">✦</span>
          <span className="font-serif text-lg tracking-wide text-ink">LifeOS</span>
        </Link>
        <nav aria-label="Main" className="hidden sm:ml-auto sm:block">
          <NavLinks />
        </nav>
        <QuickAddButton />
      </div>
    </header>
  );
}
