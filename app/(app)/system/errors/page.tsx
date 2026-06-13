import { redirect } from "next/navigation";
import { Bug } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listAppErrors } from "@/lib/db/queries";
import { Card } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { ClearErrorsButton } from "@/components/clear-errors-button";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function SourceBadge({ source }: { source: "server" | "client" }) {
  return (
    <span
      className={
        source === "server"
          ? "rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700"
          : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
      }
    >
      {source}
    </span>
  );
}

function Stack({ stack }: { stack: string | null }) {
  if (!stack) return null;
  return (
    <details className="group">
      <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
        Stack trace
      </summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-600">
        {stack}
      </pre>
    </details>
  );
}

export default async function ErrorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/");

  const entries = await listAppErrors();

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <Bug className="h-4 w-4 text-rose-500" />
        <span className="text-sm font-bold text-gray-900">Errors</span>
        <span className="text-xs text-gray-500">last {entries.length}</span>
        <div className="ml-auto">{entries.length > 0 && <ClearErrorsButton />}</div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          bare
          icon={Bug}
          title="No errors captured"
          body="Server errors (failed requests, error-level logs) and browser errors (crashes, unhandled rejections) will appear here. Old entries trim automatically after 30 days."
        />
      ) : (
        <>
          <MobileCards>
            {entries.map((e) => (
              <div key={e.id} className="space-y-1.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <SourceBadge source={e.source} />
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatDateTime(e.createdAt)}
                  </span>
                </div>
                <p className="break-words text-sm font-medium text-gray-800">{e.message}</p>
                <p className="text-xs text-gray-500">
                  {e.path && <code className="rounded bg-gray-100 px-1 py-0.5">{e.path}</code>}{" "}
                  {e.userEmail && <span>· {e.userEmail}</span>}
                </p>
                <Stack stack={e.stack} />
              </div>
            ))}
          </MobileCards>
          <DesktopTable>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Source</th>
                  <th className="px-4 py-2 text-left">Error</th>
                  <th className="px-4 py-2 text-left">Where</th>
                  <th className="px-4 py-2 text-left">Who</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      <SourceBadge source={e.source} />
                    </td>
                    <td className="max-w-xl px-4 py-2">
                      <p className="break-words font-medium text-gray-800">{e.message}</p>
                      <Stack stack={e.stack} />
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {e.path ? (
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                          {e.path}
                        </code>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{e.userEmail || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTable>
        </>
      )}
    </Card>
  );
}
