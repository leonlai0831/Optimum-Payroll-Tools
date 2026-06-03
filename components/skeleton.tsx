import { cn } from "@/lib/utils";

/**
 * Animated placeholder for content that's loading. Size with utility classes:
 * `<Skeleton className="h-4 w-full" />` for a text line, `h-32 w-full` for a
 * chart panel, etc. Stack multiple inside a Card for richer skeletons.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("animate-pulse rounded-md bg-gray-200", className)}
    />
  );
}
