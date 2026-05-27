import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPermissionConfig, savePermissionConfig } from "@/lib/db/queries";
import {
  CAPABILITIES,
  CONFIGURABLE_ROLES,
  type Capability,
  type PermissionConfig,
} from "@/lib/auth/types";

/** Editing the permission matrix is reserved for super_admins (by role, never a
 *  capability — otherwise a granted role could escalate its own privileges). */
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "super_admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return gate.error;
  return NextResponse.json(await getPermissionConfig());
}

export async function PUT(req: Request) {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return gate.error;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validCaps = new Set<string>(CAPABILITIES);
  const clean = {} as PermissionConfig;
  for (const role of CONFIGURABLE_ROLES) {
    const list = Array.isArray(body[role]) ? (body[role] as unknown[]) : [];
    clean[role] = [
      ...new Set(list.filter((c): c is Capability => typeof c === "string" && validCaps.has(c))),
    ];
  }
  await savePermissionConfig(clean);
  return NextResponse.json({ ok: true });
}
