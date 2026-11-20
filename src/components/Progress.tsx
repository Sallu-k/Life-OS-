// A thin progress bar with a label, e.g. "Page 120 of 300". value is 0..1, or null when unknown.
export function Progress({ value, label, small = false }: { value: number | null; label: string; small?: boolean }) {
  const pct = value === null ? null : Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className={`flex items-center gap-2 ${small ? "text-[11px]" : "text-sm"} text-ink-dim`}>
      {pct !== null && (
        <span className={`progress-track ${small ? "w-16" : "w-40"}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <span className="progress-fill" style={{ width: `${pct}%` }} />
        </span>
      )}
      <span>{label}</span>
    </div>
  );
}
