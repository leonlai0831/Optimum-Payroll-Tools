import { cn } from "@/lib/utils";

/**
 * The small red "phone notification" count pill. Shared by the launcher cards
 * (on the icon corner) and the section-nav tabs, so the two never drift. Renders
 * nothing for a non-positive count; caps the display at 99+.
 */
export function CountBadge({
  count,
  className,
  title,
}: {
  count: number;
  className?: string;
  title?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "nums inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white",
        className,
      )}
      title={title}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
