/**
 * Small hand-rolled SVG charts, theme-aware through the same CSS variables
 * the design system uses: strokes take currentColor, so the surrounding
 * text color classes pick the palette.
 */

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
