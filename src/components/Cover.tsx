import { assetUrl } from "@/lib/vault/assets";

// A stable number from a title, so the same book always gets the same colours.
export function titleHash(title: string): number {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

// The palette colour a title leans towards: brass or copper.
export function titleAccent(title: string): string {
  return titleHash(title) % 2 === 0 ? "var(--brass)" : "var(--copper)";
}

// Gives each title a stable, pleasant placeholder using only palette variables.
function placeholderStyle(title: string): React.CSSProperties {
  const hash = titleHash(title);
  const amount = 18 + (hash % 30); // 18%..47%
  const angle = 140 + (hash % 50); // 140..189 degrees
  return {
    background: `linear-gradient(${angle}deg, color-mix(in srgb, ${titleAccent(title)} ${amount}%, var(--surface-hi)), var(--surface) 75%)`,
  };
}

interface CoverProps {
  path: string | null; // vault-relative cover or poster path
  title: string;
  subtitle?: string;
  alt: string;
  children?: React.ReactNode; // small badges drawn on top
  ornament?: boolean; // the small star at the top of a placeholder; off when a badge sits there
}

// A book cover or game poster. Shows a titled placeholder when there is no image.
export function Cover({ path, title, subtitle, alt, children, ornament = true }: CoverProps) {
  const src = assetUrl(path);
  return (
    <div className="cover-frame relative aspect-[2/3] overflow-hidden rounded-md border border-ink-dim/20 bg-surface shadow-[0_18px_36px_-20px_var(--bg)]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="cover-placeholder" style={placeholderStyle(title)} role="img" aria-label={alt}>
          <span className="relative z-10 mx-auto h-4 text-xs text-brass/80" aria-hidden="true">
            {ornament ? "✦" : ""}
          </span>
          <span className="relative z-10 text-center font-serif text-lg leading-snug text-ink [overflow-wrap:anywhere]">{title}</span>
          <span className="relative z-10 text-center text-[0.65rem] uppercase tracking-[0.2em] text-ink-dim">{subtitle}</span>
        </div>
      )}
      {children}
    </div>
  );
}
