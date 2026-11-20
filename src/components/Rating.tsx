// Five small dots; filled ones show the rating.
export function Rating({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const dot = size === "lg" ? "h-2.5 w-2.5" : "h-1.5 w-1.5";
  return (
    <span className="flex gap-1" role="img" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`${dot} rounded-full ${n <= value ? "bg-brass" : "bg-ink-dim/30"}`} />
      ))}
    </span>
  );
}
