"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

/** Section-level error boundary shared by every `app/(app)/<section>/error.tsx`. */
export function SectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="fade-in flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-danger" />
      <h2 className="text-h2 text-gray-900">Something went wrong</h2>
      <p className="text-body max-w-md text-muted">
        We couldn&apos;t load this section. Please try again.
        {error.digest && (
          <span className="text-caption ml-1 text-muted">(ref: {error.digest})</span>
        )}
      </p>
      <Button variant="outline" onClick={reset}>
        <RefreshCw className="h-4 w-4" /> Try again
      </Button>
    </div>
  );
}
