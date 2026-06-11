import { cn } from "@/lib/utils";

/** The racing-band chevron arrow: two big `>` strokes, yellow behind blue,
 * matching the 16px bar thickness and the band's full 124px height. Shared by
 * the login band and the dashboard arrival band so the two halves of the
 * login → dashboard handoff stay identical. Points +x un-rotated — CSS motion
 * path (offset-rotate: auto) turns it through the corners. */
export const STRIPE_ARROW_W = 84;
export const STRIPE_ARROW_H = 124;
/** x of the leading (blue) tip inside the plate — the visual nose. */
export const STRIPE_ARROW_TIP = 76;

export function StripeArrowPlate({ className }: { className?: string }) {
  return (
    <svg
      className={cn(className)}
      width={STRIPE_ARROW_W}
      height={STRIPE_ARROW_H}
      viewBox={`0 0 ${STRIPE_ARROW_W} ${STRIPE_ARROW_H}`}
      fill="none"
      aria-hidden
    >
      <path
        d={`M 10 10 L 42 ${STRIPE_ARROW_H / 2} L 10 ${STRIPE_ARROW_H - 10}`}
        stroke="var(--color-accent)"
        strokeWidth={16}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M 44 10 L ${STRIPE_ARROW_TIP} ${STRIPE_ARROW_H / 2} L 44 ${STRIPE_ARROW_H - 10}`}
        stroke="var(--color-brand)"
        strokeWidth={16}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
