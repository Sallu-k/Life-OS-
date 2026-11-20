import type { AreaBalance } from "@/lib/vault/balance";

const WIDTH = 520; // drawn on a 520 x 440 grid and scales to fit
const HEIGHT = 440;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RADIUS = 150;
const RINGS = [0.2, 0.4, 0.6, 0.8, 1];

// Where an axis (one per area) points. The first area is at the top, the rest go clockwise.
function point(index: number, count: number, r: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

// A short, calm sentence per area for screen readers. The same facts are listed under the chart.
export function describe(balance: AreaBalance[]): string {
  return balance
    .map((b) => (b.value === null ? `${b.area.label}: no data yet` : `${b.area.label}: ${Math.round(b.value * 100)}% of recorded days done`))
    .join(". ");
}

// A spider graph drawn by hand in SVG. Areas with no data are shown faintly and are left out of the
// shape, so "no data yet" is never drawn as zero. `compact` is the small decorative version for the home page.
export function BalanceChart({ balance, compact = false }: { balance: AreaBalance[]; compact?: boolean }) {
  const n = balance.length;
  const withData = balance.map((b, i) => ({ b, i })).filter((x) => x.b.value !== null);
  const coords = withData.map(({ b, i }) => point(i, n, RADIUS * (b.value ?? 0)));
  const path = coords.map((p, k) => `${k === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const a11y = compact
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-labelledby": "balance-title balance-desc" };

  return (
    <svg viewBox={compact ? `${CX - RADIUS - 12} ${CY - RADIUS - 12} ${2 * RADIUS + 24} ${2 * RADIUS + 24}` : `0 0 ${WIDTH} ${HEIGHT}`} className={compact ? "balance-svg balance-compact" : "balance-svg mx-auto w-full max-w-xl"} {...a11y}>
      {!compact && <title id="balance-title">Balance across life areas, last 30 days</title>}
      {!compact && <desc id="balance-desc">{describe(balance)}</desc>}

      {RINGS.map((ring) => (
        <polygon
          key={ring}
          className="balance-ring"
          points={balance.map((_, i) => `${point(i, n, RADIUS * ring).x.toFixed(1)},${point(i, n, RADIUS * ring).y.toFixed(1)}`).join(" ")}
        />
      ))}
      {balance.map((b, i) => (
        <line key={b.area.id} className="balance-axis" x1={CX} y1={CY} x2={point(i, n, RADIUS).x} y2={point(i, n, RADIUS).y} />
      ))}

      {coords.length >= 3 && <path className="balance-shape" d={`${path} Z`} />}
      {coords.length === 2 && <path className="balance-line" d={path} />}
      {coords.map((p, k) => (
        <circle key={withData[k].b.area.id} className="balance-dot" cx={p.x} cy={p.y} r={compact ? 5 : 4} />
      ))}

      {!compact &&
        balance.map((b, i) => {
          const p = point(i, n, RADIUS + 30);
          const anchor = Math.abs(p.x - CX) < 8 ? "middle" : p.x > CX ? "start" : "end";
          const faint = b.value === null;
          return (
            <text key={b.area.id} x={p.x} y={p.y} textAnchor={anchor} className={faint ? "balance-label balance-faint" : "balance-label"}>
              <tspan x={p.x} dy="0.3em">
                {b.area.label}
              </tspan>
              <tspan x={p.x} dy="1.4em" className={faint ? "balance-note" : "balance-value"}>
                {faint ? "no data yet" : `${Math.round((b.value ?? 0) * 100)}%`}
              </tspan>
            </text>
          );
        })}
    </svg>
  );
}
