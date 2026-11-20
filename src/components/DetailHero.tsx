import { BackLink } from "./BackLink";
import { Cover, titleAccent } from "./Cover";

interface DetailHeroProps {
  back: { href: string; label: string };
  cover: { path: string | null; title: string; subtitle: string; alt: string };
  children: React.ReactNode; // status, title and facts next to the cover
  glow?: boolean; // the tinted glow behind the cover; off when a backdrop image is shown
}

// Top of a book or game page: Back link, the cover with a soft tinted glow, and the facts beside it.
export function DetailHero({ back, cover, children, glow = true }: DetailHeroProps) {
  const tint = { "--tint": titleAccent(cover.title) } as React.CSSProperties;
  return (
    <div className="relative isolate flex flex-col gap-8">
      {glow && <div className="hero-glow" style={tint} aria-hidden="true" />}
      <BackLink href={back.href} label={back.label} />
      <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:gap-10">
        <div className="cover-reveal w-44 shrink-0 sm:w-60">
          <Cover path={cover.path} title={cover.title} subtitle={cover.subtitle} alt={cover.alt} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

// One small fact, e.g. "Finished · March 2026".
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-ink-dim/15 bg-surface/60 px-3.5 py-2.5">
      <dt className="text-[0.65rem] uppercase tracking-[0.2em] text-ink-dim">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}
