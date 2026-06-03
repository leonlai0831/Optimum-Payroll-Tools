import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getGymStaffEarnings, getGymStaffMember } from "@/lib/db/queries";
import { gymEmploymentLabel, gymPositionLabel } from "@/lib/gym/types";
import { Badge, Button, Card } from "@/components/ui";
import { rm } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GymStaffEarningsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = await getGymStaffMember(Number(id));
  if (!member) notFound();
  const report = await getGymStaffEarnings(member);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link
            href="/commission/staff"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Back to staff
          </Link>
          <h1 className="mt-0.5 flex items-center gap-2 text-lg font-bold text-gray-900">
            {member.name}
            <Badge className="border-gray-200 bg-gray-50 text-gray-600">{gymPositionLabel(member.position)}</Badge>
          </h1>
          <p className="text-xs text-gray-400">
            {member.staffCode ? `Code ${member.staffCode} · ` : ""}
            {gymEmploymentLabel(member.employmentType)} · income assembled from saved commission + coaching months
          </p>
        </div>
        {report.months.length > 0 && (
          <a href={`/api/commission/staff/${member.id}/export`}>
            <Button variant="outline">
              <Download className="h-4 w-4" /> Download Excel
            </Button>
          </a>
        )}
      </div>

      {report.months.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          No saved months with earnings for {member.name} yet. Save a Commission or Coaching month to History — they’ll
          be matched here by staff code{member.aliases.length > 0 ? " / name aliases" : " and name"}.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-overline text-muted">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2 text-right">Coaching income</th>
                <th className="px-3 py-2 text-right">Total income</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.months.map((m) => (
                <tr key={m.period} className="tabular-nums">
                  <td className="px-3 py-2 font-medium">
                    <Link
                      href={`/commission/staff/${member.id}/${encodeURIComponent(m.period)}`}
                      className="text-gray-900 hover:text-brand hover:underline"
                    >
                      {m.period}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{rm(m.commission)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{rm(m.coachingIncome)}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700">{rm(m.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 tabular-nums">
              <tr className="font-bold text-gray-900">
                <td className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2 text-right">{rm(report.totals.commission)}</td>
                <td className="px-3 py-2 text-right">{rm(report.totals.coachingIncome)}</td>
                <td className="px-3 py-2 text-right text-green-700">{rm(report.totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
