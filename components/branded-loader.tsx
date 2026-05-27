/** Branded loading animation: the Optimum Swim School logo animation, shown via
 * the section loading.tsx fallbacks while a server component fetches. */
export function BrandedLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[45vh] flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <video
        className="w-44 max-w-[70vw] rounded-2xl shadow-sm"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-label="Optimum Swim School loading animation"
      >
        <source src="/logo-animation.mp4" type="video/mp4" />
      </video>
      <p className="text-sm font-semibold tracking-wide text-brand">{label}</p>
    </div>
  );
}
