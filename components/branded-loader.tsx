import Image from "next/image";

/** Branded loading animation: a brand-blue ring with an accent-gold counter-arc
 * spinning around the Optimum logo mark, which gently breathes. Used as the
 * loading.tsx fallback while a section's server component fetches. */
export function BrandedLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[45vh] flex-col items-center justify-center gap-5"
      role="status"
      aria-live="polite"
    >
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span
          className="absolute inset-0 animate-spin rounded-full border-4 border-brand-light border-t-brand"
          style={{ animationDuration: "0.9s" }}
        />
        <span
          className="absolute inset-1.5 animate-spin rounded-full border-2 border-transparent border-b-accent"
          style={{ animationDuration: "1.5s", animationDirection: "reverse" }}
        />
        <Image
          src="/logo-mark.png"
          alt="Optimum Swim School"
          width={40}
          height={40}
          priority
          className="h-10 w-auto animate-brand-breathe"
        />
      </div>
      <p className="text-sm font-semibold tracking-wide text-brand">{label}</p>
    </div>
  );
}
