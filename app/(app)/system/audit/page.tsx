import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listAuditLog } from "@/lib/db/queries";
import { Card } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/");

  const entries = await listAuditLog();

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <ScrollText className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-bold text-gray-900">Audit log</span>
          <span className="text-xs text-gray-500">last {entries.length}</span>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            bare
            icon={ScrollText}
            title="No activity yet"
            body="Sensitive changes — settings, permissions, users, staff profiles, assessments, notes, and saved runs — will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Who</th>
                  <th className="px-4 py-2 text-left">Action</th>
                  <th className="px-4 py-2 text-left">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {e.actorEmail || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                        {e.action}
                      </code>
                    </td>
                    <td className="px-4 py-2 text-gray-700">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
