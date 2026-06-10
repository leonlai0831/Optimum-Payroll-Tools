import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getGymStaffMember, getGymStaffMonth } from "@/lib/db/queries";
import { Card } from "@/components/ui";
import { cn, rm, rm2 } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "green" | "brand" }) {
  return (
    <Card className="p-3">
      <div className="text-overline text-muted">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-xl font-extrabold tabular-nums",
          tone === "green" ? "text-green-700" : tone === "brand" ? "text-brand" : "text-gray-900",
        )}
      >
        {value}
      </div>
    </Card>
  );
}

export default async function GymStaffMonthPage({ params }: { params: Promise<{ id: string; period: string }> }) {
  const { id, period } = await params;
  const [user, member] = await Promise.all([getCurrentUser(), getGymStaffMember(Number(id))]);
  if (!user) redirect("/login");
  if (!member) notFound();
  const detail = await getGymStaffMonth(member, decodeURIComponent(period));
  if (!detail) notFound();

  const { commission, coaching } = detail;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/commission/staff/${member.id}`}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand hover:underline"
        >
          <ArrowLeft className="h-3 w-3" /> Back to {member.name}
        </Link>
        <h1 className="mt-0.5 text-lg font-bold text-gray-900">
          {member.name} · {detail.period}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Commission" value={rm(commission?.commission ?? 0)} />
        <Stat label="Coaching income" value={rm(coaching?.totalIncome ?? 0)} />
        <Stat label="Total income" value={rm(detail.total)} tone="green" />
      </div>

      {commission && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-gray-900">Commission</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-100 tabular-nums">
                <tr>
                  <td className="py-1.5 text-gray-500">Transactions</td>
                  <td className="py-1.5 text-right text-gray-900">{commission.transactions}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-500">Subscription base</td>
                  <td className="py-1.5 text-right text-gray-900">{rm2(commission.subscriptionBase)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-500">Package base</td>
                  <td className="py-1.5 text-right text-gray-900">{rm2(commission.packageBase)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-500">Registration base</td>
                  <td className="py-1.5 text-right text-gray-900">{rm2(commission.registrationBase)}</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1.5 text-gray-700">Total base</td>
                  <td className="py-1.5 text-right text-gray-900">{rm2(commission.totalBase)}</td>
                </tr>
                <tr className="font-bold">
                  <td className="py-1.5 text-gray-900">Commission</td>
                  <td className="py-1.5 text-right text-green-700">{rm(commission.commission)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {coaching && (
        <Card className="overflow-x-auto p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
            <h2 className="text-sm font-bold text-gray-900">Coaching income</h2>
            <p className="text-xs text-gray-500 tabular-nums">
              PT {coaching.ptSessions} sessions · {coaching.ptAttendees} attendees · {rm(coaching.ptIncome)} &nbsp;|&nbsp;
              Group {coaching.groupSessions} sessions · {rm(coaching.groupIncome)}
            </p>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-overline text-muted">
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2 text-right">Attendees</th>
                <th className="px-3 py-2 text-right">Income</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 tabular-nums">
              {coaching.classes.map((c) => (
                <tr key={c.className + c.kind}>
                  <td className="px-3 py-2 text-gray-900">{c.className}</td>
                  <td className="px-3 py-2 text-gray-500">{c.kind === "pt" ? "PT" : "Group"}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{c.sessions}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{c.attendees}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{rm(c.income)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 tabular-nums">
              <tr className="font-bold text-gray-900">
                <td className="px-3 py-2" colSpan={4}>
                  TOTAL
                </td>
                <td className="px-3 py-2 text-right text-green-700">{rm(coaching.totalIncome)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
