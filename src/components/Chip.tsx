// A filter button. `pressed` shows which filter is active (read out by screen readers too).
export function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className="chip">
      {children}
    </button>
  );
}
