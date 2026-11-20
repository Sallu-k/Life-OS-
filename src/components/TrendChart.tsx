// A simple monthly chart drawn by hand in SVG: a line (averages) or bars (totals), one series, one axis.
// Months without data are gaps, never zero. Each point has a native tooltip, and the same numbers are
// listed under the chart for screen readers and for reading exact values.
import { monthName } from "@/lib/vault/history";

export interface TrendPoint {
  month: string; // YYYY-MM
  value: number | null;
}

const W = 720;
const H = 220;
const PAD = { left: 40, right: 12, top: 14, bottom: 30 };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
}

export function TrendChart({ title, points, unit, kind, digits = 0 }: { title: string; points: TrendPoint[]; unit: string; kind: "line" | "bar"; digits?: number }) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const max = niceMax(Math.max(...values));
  const n = points.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const fmt = (v: number) => `${v.toFixed(digits)}${unit}`;

  // Lines break at months without data.
  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)} `;
  });
  if (current) segments.push(current);

  const barW = Math.max(4, Math.min(18, plotW / n - 4));
  const ticks = [0, max / 2, max];
  const yearStarts = points.map((p, i) => ({ p, i })).filter(({ p, i }) => i === 0 || p.month.endsWith("-01"));

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm text-ink">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg w-full" role="img" aria-label={`${title}. ${points.filter((p) => p.value !== null).map((p) => `${monthName(p.month)}: ${fmt(p.value!)}`).join(". ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="trend-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="trend-axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {yearStarts.map(({ p, i }) => (
          <text key={p.month} className="trend-axis" x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : "middle"}>
            {p.month.endsWith("-01") || i === 0 ? monthName(p.month, true) : ""}
          </text>
        ))}
        {kind === "line" && segments.map((d, i) => <path key={i} className="trend-line" d={d} />)}
        {points.map((p, i) =>
          p.value === null ? null : kind === "line" ? (
            <circle key={p.month} className="trend-dot" cx={x(i)} cy={y(p.value)} r={4}>
              <title>{`${monthName(p.month)}: ${fmt(p.value)}`}</title>
            </circle>
          ) : (
            <rect key={p.month} className="trend-bar" x={x(i) - barW / 2} y={y(p.value)} width={barW} height={Math.max(1, PAD.top + plotH - y(p.value))} rx={3}>
              <title>{`${monthName(p.month)}: ${fmt(p.value)}`}</title>
            </rect>
          ),
        )}
      </svg>
    </figure>
  );
}
