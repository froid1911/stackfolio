/**
 * The Stackfolio "Honest Stack" mark: three layers — wallet, protocol,
 * chain — the lowest an outline, because what can't be valued yet is
 * shown, never hidden. Colours follow the theme: the violet layer is
 * --primary, the solid layer the text colour, the outline its stroke.
 */
export function StackMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  // Below 24 px the dashed outline breaks up; it goes solid at 40 % instead.
  const small = size < 24;
  const layer = "M32 40 L56 28 L32 16 L8 28 Z";
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`shrink-0 text-foreground ${className}`}
    >
      {small ? (
        <path d={layer} fill="currentColor" fillOpacity={0.4} transform="translate(0 12)" />
      ) : (
        <path
          d={layer}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeDasharray="4 4"
          strokeLinejoin="round"
          transform="translate(0 12)"
        />
      )}
      <path
        d={layer}
        fill="currentColor"
        stroke="var(--background)"
        strokeWidth={3}
        strokeLinejoin="round"
        transform="translate(0 2)"
      />
      <path
        d={layer}
        fill="var(--primary)"
        stroke="var(--background)"
        strokeWidth={3}
        strokeLinejoin="round"
        transform="translate(0 -8)"
      />
    </svg>
  );
}

/** Mark and lowercase wordmark; the wordmark hides where the sidebar collapses. */
export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3">
      <StackMark />
      <div className="min-w-0 md:max-xl:hidden">
        <p className="text-base font-semibold leading-tight tracking-tight">stackfolio</p>
        {/* The drive's name, unless it only repeats the product's. */}
        {subtitle && subtitle.trim().toLowerCase() !== "stackfolio" && (
          <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
