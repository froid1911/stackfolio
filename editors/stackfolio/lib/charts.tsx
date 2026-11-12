/**
 * Small hand-rolled SVG charts, theme-aware through the same CSS variables
 * the design system uses: strokes take currentColor, so the surrounding
 * text color classes pick the palette.
 */

/** A line with a soft area beneath; values plotted oldest to newest. */
export function Sparkline({
  points,
  height = 120,
  strokeClass = "text-violet-500",
  area = true,
}: {
  points: number[];
  height?: number;
  strokeClass?: string;
  area?: boolean;
}) {
  const w = 600;
  const h = height;
  if (points.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        Nothing to plot yet.
      </div>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const y = (v: number) => h - 4 - ((v - min) / span) * (h - 8);
  const coords = points.map((v, i) => `${i === 0 ? 0 : i * step},${y(v)}`);
  const line = coords.join(" ");
  const fill = `0,${h} ${line} ${points.length > 1 ? w : 0},${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`${strokeClass} h-${Math.min(height, 200)} w-full`}
      style={{ height, width: "100%" }}
      role="img"
      aria-label="line chart"
    >
      {area && <polygon points={fill} fill="currentColor" opacity={0.12} />}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Column chart; each column's label shows under it. */
export function Bars({
  values,
  labels,
  height = 160,
  strokeClass = "text-sky-500",
}: {
  values: number[];
  labels: string[];
  height?: number;
  strokeClass?: string;
}) {
  const w = 600;
  const n = values.length;
  if (n === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        Nothing to plot yet.
      </div>
    );
  }
  const max = Math.max(...values) || 1;
  const slot = w / n;
  const bar = Math.max(2, slot * 0.6);
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="bar chart"
      >
        {values.map((v, i) => {
          const bh = (v / max) * (height - 8);
          return (
            <rect
              key={i}
              className={strokeClass}
              x={i * slot + (slot - bar) / 2}
              y={height - 4 - bh}
              width={bar}
              height={Math.max(bh, v > 0 ? 2 : 0)}
              fill="currentColor"
              rx={2}
            />
          );
        })}
      </svg>
      {labels.length > 0 && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{labels[0]}</span>
          {labels.length > 2 && <span>{labels[Math.floor(n / 2)]}</span>}
          <span>{labels[n - 1]}</span>
        </div>
      )}
    </div>
  );
}

/** Donut of shares; colors follow a fixed tailwind hue cycle. */
const HUES = [
  "text-violet-500",
  "text-sky-500",
  "text-emerald-500",
  "text-amber-500",
  "text-rose-500",
  "text-fuchsia-500",
  "text-teal-500",
];

export function Donut({
  slices,
  center,
  sub,
}: {
  slices: { label: string; value: number; color?: string }[];
  center: string;
  sub?: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = 60;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label="allocation">
        <circle
          cx={80}
          cy={80}
          r={r}
          fill="none"
          strokeWidth={18}
          stroke="currentColor"
          className="text-border"
        />
        {total > 0 &&
          slices.map((s, i) => {
            const frac = s.value / total;
            const dash = frac * c;
            const offset = c - acc;
            acc += dash;
            return (
              <circle
                key={s.label}
                cx={80}
                cy={80}
                r={r}
                fill="none"
                strokeWidth={18}
                stroke="currentColor"
                className={s.color ?? HUES[i % HUES.length]}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={offset}
                transform="rotate(-90 80 80)"
              />
            );
          })}
        <text x={80} y={76} textAnchor="middle" className="fill-current text-[13px] font-semibold">
          {center}
        </text>
        {sub && (
          <text
            x={80}
            y={94}
            textAnchor="middle"
            className="fill-current text-[10px] text-muted-foreground"
          >
            {sub}
          </text>
        )}
      </svg>
      <ul className="grid gap-1 text-xs">
        {slices.slice(0, 8).map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-sm ${s.color ?? HUES[i % HUES.length]} bg-current`}
            />
            <span className="max-w-40 truncate">{s.label}</span>
            <span className="text-muted-foreground">
              {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
