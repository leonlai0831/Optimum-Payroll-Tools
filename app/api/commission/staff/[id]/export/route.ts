import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
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
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const member = await getGymStaffMember(Number(id));
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
