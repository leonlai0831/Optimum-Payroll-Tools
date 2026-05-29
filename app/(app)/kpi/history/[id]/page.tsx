import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRun } from "@/lib/db/queries";
import { Badge, Card } from "@/components/ui";
import { SectionNav } from "@/components/section-nav";
import { DeleteRunButton } from "@/components/delete-run-button";
import { rm } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await getRun(Number(id));
  if (!run) notFound();

  const coaches = [...run.coachResults].sort((a, b) => b.finalScore - a.finalScore);
  const totalPayout = coaches.reduce((s, c) => s + (c.payout || 0), 0);

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" />
      <div className="flex items-center justify-between">
        <div>
          <Link href="/kpi/history" className="flex items-center gap-1 text-xs text-indigo-600">
            <ArrowLeft className="h-3 w-3" /> Back to history
          </Link>
          <h1 className="mt-1 text-lg font-bold text-gray-900">{run.periodLabel}</h1>
          <p className="text-xs text-gray-500">
            {run.filename} · saved {new Date(run.createdAt).toLocaleString()} · total {rm(totalPayout)}
          </p>
        </div>
        <DeleteRunButton id={run.id} />
      </div>

      <Card className="overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Coach</th>
              <th className="px-4 py-2 text-left">Center</th>
              <th className="px-4 py-2 text-center">Students</th>
              <th className="px-4 py-2 text-left">Position</th>
              <th className="px-4 py-2 text-center">Score</th>
              <th className="px-4 py-2 text-center">Grade</th>
              <th className="px-4 py-2 text-right">Allowance</th>
              <th className="px-4 py-2 text-right">Payout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {coaches.map((c) => (
              <tr key={c.canonicalName}>
                <td className="px-4 py-2 font-medium text-gray-900">
                  {c.canonicalName}
                  {!c.isComplete && (
                    <span className="ml-2 text-[10px] text-amber-600">incomplete</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{c.center}</td>
                <td className="px-4 py-2 text-center text-gray-600">{c.students}</td>
                <td className="px-4 py-2 text-gray-600">{c.position}</td>
                <td className="px-4 py-2 text-center font-bold text-indigo-600">
                  {c.finalScore.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-center">
                  <Badge className="border-gray-300 bg-gray-100 text-gray-700">{c.grade}</Badge>
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {c.teachingAllowance ? rm(c.teachingAllowance) : "—"}
                </td>
                <td className="px-4 py-2 text-right font-medium text-green-700">
                  {rm(c.payout)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
