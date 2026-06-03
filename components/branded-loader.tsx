/** Branded loading animation shown via the section loading.tsx fallbacks while a
 * server component fetches. Defaults to the Optimum Swim School clip; pass `src`
 * for a brand-specific one (e.g. the Optimum Fit motion logo under /commission).
 * The label uses `text-brand`, so it re-colors per the active brand skin. */
export function BrandedLoader({
  label = "Loading…",
  src = "/logo-animation.mp4",
}: {
  label?: string;
  src?: string;
}) {
  return (
    <div
      className="flex min-h-[45vh] flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <video
        key={src}
        className="w-28 max-w-[60vw] rounded-2xl shadow-sm"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-label="Loading animation"
      >
        <source src={src} type="video/mp4" />
      </video>
      <p className="text-sm font-semibold tracking-wide text-brand">{label}</p>
    </div>
  );
}
