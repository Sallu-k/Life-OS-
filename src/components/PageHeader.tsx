// The heading block at the top of each list page.
export function PageHeader({ eyebrow, title, stats, children }: { eyebrow: string; title: string; stats?: string[]; children?: React.ReactNode }) {
  return (
    <header className="mb-7 flex flex-col gap-5 sm:mb-12 sm:gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-3">
        <p className="eyebrow page-eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        {stats && stats.length > 0 && (
          <p className="flex flex-wrap gap-x-3 text-sm text-ink-dim">
            {stats.map((s, i) => (
              <span key={s}>
                {i > 0 && <span className="mr-3 text-brass/60" aria-hidden="true">·</span>}
                {s}
              </span>
            ))}
          </p>
        )}
      </div>
      {children}
    </header>
  );
}
