import Link from "next/link";

type Section = "library" | "games" | "certificates" | "achievements" | "habits" | "balance";

// One big link on the home page. Its colours and type come from the section's own theme (see globals.css).
export function SectionTile({
  href,
  section,
  eyebrow,
  title,
  line,
  wide = false,
  full = false,
  children,
}: {
  href: string;
  section: Section;
  eyebrow: string;
  title: string;
  line: string;
  wide?: boolean;
  full?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className={`section-tile tile-${section} ${wide ? "lg:col-span-2" : ""} ${full ? "lg:col-span-3" : ""}`}>
      <span className="section-tile-eyebrow">{eyebrow}</span>
      <span className="section-tile-title">{title}</span>
      <span className="text-sm text-ink-dim">{line}</span>
      {children}
      <span className="section-tile-arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
