import { Badge } from "@/components/ui";
import type { KpiIngestSource, KpiIngestStatus } from "@/lib/db/queries";

/**
 * Status + source badges for a staged student-data delivery, shared by the
 * Student Progress months list and the delivery detail editor (server- and
 * client-rendered alike — no hooks here).
 */

export function IngestStatusBadge({ status }: { status: KpiIngestStatus }) {
  if (status === "pending") {
    return <Badge className="border-amber-300 bg-amber-100 text-amber-800">Pending</Badge>;
  }
  if (status === "imported") {
    return <Badge className="border-green-300 bg-green-100 text-green-800">Imported</Badge>;
  }
  if (status === "superseded") {
    // Muted + struck through: visually "replaced", distinct from a deliberate discard.
    return (
      <Badge className="border-gray-200 bg-gray-50 text-gray-400 line-through decoration-gray-400">
        Superseded
      </Badge>
    );
  }
  return <Badge className="border-gray-300 bg-gray-100 text-gray-600">Discarded</Badge>;
}

export function IngestSourceBadge({ source }: { source: KpiIngestSource }) {
  return source === "manual" ? (
    <Badge className="border-violet-300 bg-violet-50 text-violet-700">Manual</Badge>
  ) : (
    <Badge className="border-sky-300 bg-sky-50 text-sky-700">API</Badge>
  );
}
