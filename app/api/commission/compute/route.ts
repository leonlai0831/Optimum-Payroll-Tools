import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getCommissionConfig } from "@/lib/db/queries";
import { computeCommission, monthLabelFromRows } from "@/lib/commission/calc";
import { consolidate, parseSalesFile } from "@/lib/commission/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOTS = ["membership", "subscription", "package"] as const;

/**
 * Parse the 3 uploaded .xlsx sales exports, consolidate them, and compute the
 * commission summary against the current rate bands. All 3 files are required.
 */
export async function POST(req: Request) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;

  const form = await req.formData();
  const missing = SLOTS.filter((s) => {
    const f = form.get(s);
    return !(f instanceof File) || f.size === 0;
  });
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "missing_files", missing, message: `Missing file(s): ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const [membership, subscription, packages] = await Promise.all([
    parseSalesFile(await (form.get("membership") as File).arrayBuffer(), "Membership"),
    parseSalesFile(await (form.get("subscription") as File).arrayBuffer(), "Subscription"),
    parseSalesFile(await (form.get("package") as File).arrayBuffer(), "Package"),
  ]);

  const rows = consolidate([membership, subscription, packages]);
  if (rows.length === 0) {
    return NextResponse.json({ error: "empty", message: "No sales rows found in the uploads." }, { status: 400 });
  }

  const config = await getCommissionConfig();
  const summary = computeCommission(rows, config);
  const monthLabel = monthLabelFromRows(rows);

  return NextResponse.json({
    monthLabel,
    rows,
    summary,
    config,
    counts: {
      membership: membership.length,
      subscription: subscription.length,
      package: packages.length,
      total: rows.length,
    },
  });
}
