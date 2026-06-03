import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getCoachProfile, recordAudit } from "@/lib/db/queries";
import { buildPayslipPdf, type PayslipData } from "@/lib/reports/payslip";
import { EMPLOYEE_ROLE_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/lib/performance/types";

export async function GET(req: Request, ctx: RouteContext<"/api/coaches/[id]/payslip">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const coachId = Number(id);
  if (!Number.isFinite(coachId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  // Same access rule as the staff profile page: anyone who can view all staff,
  // or the coach viewing their own profile.
  const caps = await getCapabilities(user);
  const canViewAll = caps.has("view_all_staff");
  const isOwn = caps.has("view_own") && user.coachId === coachId;
  if (!canViewAll && !isOwn) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const period = new URL(req.url).searchParams.get("period")?.trim() ?? "";
  if (!period) {
    return NextResponse.json({ error: "period is required" }, { status: 400 });
  }

  const profile = await getCoachProfile(coachId);
  if (!profile) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const kpiPoint = profile.kpi.find((k) => k.period === period) ?? null;
  const allowanceRec = profile.allowance.find((a) => a.periodLabel === period) ?? null;
  if (!kpiPoint && !allowanceRec) {
    return NextResponse.json({ error: "no records for that period" }, { status: 404 });
  }

  const { coach } = profile;
  const data: PayslipData = {
    companyName: "Optimum Swim School",
    period,
    generatedAt: new Date(),
    coach: {
      name: coach.canonicalName,
      center: coach.center,
      jobRole: EMPLOYEE_ROLE_LABELS[coach.jobRole] ?? coach.jobRole,
      employmentType: EMPLOYMENT_TYPE_LABELS[coach.employmentType] ?? coach.employmentType,
      tier: coach.allowanceTier ?? allowanceRec?.tier ?? null,
    },
    kpi: kpiPoint
      ? {
          finalScore: kpiPoint.finalScore,
          grade: kpiPoint.grade,
          students: kpiPoint.students,
          bonus: kpiPoint.payout,
        }
      : null,
    allowance: allowanceRec
      ? {
          tier: allowanceRec.tier,
          attendancePct: allowanceRec.attendancePct,
          attendance: allowanceRec.attendance,
          teaching: allowanceRec.teaching,
          other: allowanceRec.other,
          otherItems: allowanceRec.otherItems.map((it) => ({
            reason: it.reason,
            center: it.center,
            amount: it.amount,
          })),
          grandTotal: allowanceRec.grandTotal,
        }
      : null,
  };

  const pdf = await buildPayslipPdf(data);

  // Exporting pay data is sensitive — record who downloaded whose payslip.
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "payslip.export",
    entity: "coach",
    entityId: coachId,
    summary: `Exported payslip for ${coach.canonicalName} (${period})`,
  });

  const slug = coach.canonicalName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "coach";
  const filename = `payslip-${slug}-${period}.pdf`;
  return new NextResponse(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
