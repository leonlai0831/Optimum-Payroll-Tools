import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getGymStaffEarnings, getGymStaffMember } from "@/lib/db/queries";
import { buildStaffEarningsWorkbook } from "@/lib/earnings/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "staff";
  return `optimum_fit_${slug}_earnings.xlsx`;
}

/** One staff member's earnings across saved months, as an Excel workbook. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const staffId = Number(id);

  // Same access rule as the payslip route: anyone who can view all staff, or the
  // staff member viewing their own earnings.
  const caps = await getCapabilities(user);
  const canViewAll = caps.has("fit_view_staff");
  const isOwn = caps.has("view_own") && user.gymStaffId === staffId;
  if (!canViewAll && !isOwn) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const member = await getGymStaffMember(staffId);
  if (!member) return NextResponse.json({ error: "not found" }, { status: 404 });

  const report = await getGymStaffEarnings(member);
  const buf = await buildStaffEarningsWorkbook({ staffName: member.name, staffCode: member.staffCode, report });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName(member.name)}"`,
    },
  });
}
