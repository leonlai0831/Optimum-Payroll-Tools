/** Generic pulsing placeholder shown via `loading.tsx` while a section's
 * server component fetches (DB queries on dynamic routes). Approximates a
 * toolbar + table so navigation feels instant instead of blocking on a blank
 * screen. */
export function SectionSkeleton() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm" aria-hidden>
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <div className="h-7 w-44 animate-pulse rounded bg-gray-200" />
        <div className="h-7 w-28 animate-pulse rounded bg-gray-200" />
        <div className="ml-auto h-4 w-16 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 flex-1 animate-pulse rounded bg-gray-100" />
            <div className="h-8 w-24 animate-pulse rounded bg-gray-100" />
            <div className="h-8 w-24 animate-pulse rounded bg-gray-100" />
            <div className="h-8 w-16 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
