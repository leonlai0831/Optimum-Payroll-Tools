import { cn } from "@/lib/utils";

/**
 * The Optimum Fit deck's racing-stripe motif — four square-edged horizontal
 * bars in the deck's order (yellow / blue / yellow / yellow), tokenized to
 * the active brand skin as accent / brand / accent / accent. On swim and
 * shared surfaces it renders the deck's exact yellow+blue; inside
 * [data-brand="fit"] the brand bar turns black to match the in-app Fit skin.
 * Size the cluster by setting a width on the container.
 */
export function BrandStripes({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-32 flex-col gap-2", className)} aria-hidden>
      <span className="h-2 bg-accent" />
      <span className="h-2 bg-brand" />
      <span className="h-2 bg-accent" />
      <span className="h-2 bg-accent" />
    </div>
  );
}
