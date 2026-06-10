import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPermissionConfig, recordAudit, savePermissionConfig } from "@/lib/db/queries";
import {
  CAPABILITIES,
  CONFIGURABLE_ROLES,
  sanitizeToolCategories,
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

  const body = (await req.json().catch(() => ({}))) as {
    capabilities?: Record<string, unknown>;
    categories?: Record<string, unknown>;
  };
  const caps = body.capabilities ?? {};
  const cats = body.categories ?? {};
  const validCaps = new Set<string>(CAPABILITIES);
  const clean: PermissionConfig = {
    capabilities: {} as PermissionConfig["capabilities"],
    categories: {} as PermissionConfig["categories"],
  };
  for (const role of CONFIGURABLE_ROLES) {
    const list = Array.isArray(caps[role]) ? (caps[role] as unknown[]) : [];
    clean.capabilities[role] = [
      ...new Set(list.filter((c): c is Capability => typeof c === "string" && validCaps.has(c))),
    ];
    // Categories are strict: an unknown value (or a non-array) is a 400 —
    // silently dropping one would widen/narrow launcher visibility unnoticed.
    const categories = sanitizeToolCategories(cats[role]);
    if (!categories) {
      return NextResponse.json(
        { error: `Invalid launcher categories for role "${role}".` },
        { status: 400 },
      );
    }
    clean.categories[role] = categories;
  }
  await savePermissionConfig(clean);
  await recordAudit({
    actorId: gate.user.id,
    actorEmail: gate.user.email,
    action: "permissions.update",
    entity: "permission_config",
    summary: "Updated role capabilities & launcher-category defaults",
  });
  return NextResponse.json({ ok: true });
}
