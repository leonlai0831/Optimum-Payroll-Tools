import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getGymStaffEarnings, getGymStaffMember, listGymNotes } from "@/lib/db/queries";
import { gymEmploymentLabel, gymPositionLabel } from "@/lib/gym/types";
import { Button, Card } from "@/components/ui";
import { GymStaffDetailsCard } from "@/components/gym-staff-details-card";
import { NotesTimeline, type NoteView } from "@/components/notes-timeline";
import { rm } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GymStaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, member] = await Promise.all([getCurrentUser(), getGymStaffMember(Number(id))]);
  if (!user) redirect("/login");
  if (!member) notFound();
  const [report, noteRecords, caps] = await Promise.all([
    getGymStaffEarnings(member),
    listGymNotes(member.id),
    getCapabilities(user),
  ]);
  const canEdit = caps.has("edit_staff");
  const notes: NoteView[] = noteRecords.map((n) => ({
    id: n.id,
    noteDate: n.noteDate.toISOString(),
    type: n.type,
    title: n.title,
    body: n.body,
    severity: n.severity,
    followUp: n.followUp,
    authoredBy: n.authoredBy,
  }));

  return (
    <div className="space-y-4">
      <Link
        href="/commission/staff"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" /> Directory
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{member.name}</h1>
        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
          {gymPositionLabel(member.position)}
        </span>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
          {gymEmploymentLabel(member.employmentType)}
        </span>
        {member.staffCode && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-gray-500">
            {member.staffCode}
          </span>
        )}
        {!member.active && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">Inactive</span>
        )}
      </div>

      <GymStaffDetailsCard member={member} canEdit={canEdit} />

      <NotesTimeline
        subjectId={member.id}
        notes={notes}
        canEdit={caps.has("edit_notes")}
        createUrl={`/api/gym/staff/${member.id}/notes`}
        deleteBase="/api/gym/notes"
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <span className="text-sm font-bold text-gray-900">Earnings</span>
          {report.months.length > 0 && (
            <a href={`/api/commission/staff/${member.id}/export`}>
              <Button variant="outline" className="px-2 py-1 text-xs">
                <Download className="h-3.5 w-3.5" /> Excel
              </Button>
            </a>
          )}
        </div>

        {report.months.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">
            No saved months with earnings for {member.name} yet. Save a Commission or Coaching month to History — they’ll
            be matched here by staff code{member.aliases.length > 0 ? " / name aliases" : " and name"}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Month</th>
                  <th className="px-4 py-2 text-right">Commission</th>
                  <th className="px-4 py-2 text-right">Coaching income</th>
                  <th className="px-4 py-2 text-right">Total income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.months.map((m) => (
                  <tr key={m.period} className="tabular-nums">
                    <td className="px-4 py-2 font-medium">
                      <Link
                        href={`/commission/staff/${member.id}/${encodeURIComponent(m.period)}`}
                        className="text-gray-900 hover:text-brand hover:underline"
                      >
                        {m.period}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{rm(m.commission)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{rm(m.coachingIncome)}</td>
                    <td className="px-4 py-2 text-right font-bold text-green-700">{rm(m.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 tabular-nums">
                <tr className="font-bold text-gray-900">
                  <td className="px-4 py-2">TOTAL</td>
                  <td className="px-4 py-2 text-right">{rm(report.totals.commission)}</td>
                  <td className="px-4 py-2 text-right">{rm(report.totals.coachingIncome)}</td>
                  <td className="px-4 py-2 text-right text-green-700">{rm(report.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
