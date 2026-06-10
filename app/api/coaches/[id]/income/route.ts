import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getCoachProfile, recordAudit } from "@/lib/db/queries";
import { isValidPeriod, previousPeriod } from "@/lib/allowance/period";
import { buildPayslipPdf, type PayslipData } from "@/lib/reports/payslip";
import { EMPLOYEE_ROLE_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/lib/performance/types";

export async function GET(req: Request, ctx: RouteContext<"/api/coaches/[id]/income">) {
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
  const canViewAll = caps.has("swim_view_staff");
  const isOwn = caps.has("view_own") && user.coachId === coachId;
  if (!canViewAll && !isOwn) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const period = new URL(req.url).searchParams.get("period")?.trim() ?? "";
  if (!isValidPeriod(period)) {
    return NextResponse.json({ error: "period must be a valid YYYY-MM month" }, { status: 400 });
  }
  // Income for month M pays out M's teaching allowance together with the KPI
  // bonus EARNED in M-1 (the bonus is computed after month close, so it lands
  // one payout cycle later).
  const kpiPeriod = previousPeriod(period);

  const profile = await getCoachProfile(coachId);
  if (!profile) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const kpiPoint = profile.kpi.find((k) => k.period === kpiPeriod) ?? null;
  const allowanceRec = profile.allowance.find((a) => a.periodLabel === period) ?? null;
  if (!kpiPoint && !allowanceRec) {
    return NextResponse.json({ error: "no records for that period" }, { status: 404 });
  }

  const { coach } = profile;
  const data: PayslipData = {
    companyName: "Optimum Swim School",
    period,
    kpiPeriod,
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
    action: "income.export",
    entity: "coach",
    entityId: coachId,
    summary: `Exported income statement for ${coach.canonicalName} (${period})`,
  });

  const slug = coach.canonicalName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "coach";
  const filename = `income-${slug}-${period}.pdf`;
  return new NextResponse(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
