import { cache } from "react";
import { NextResponse } from "next/server";
import type { CurrentUser } from "./session";
import { CAPABILITIES, type Capability } from "./types";
import { getPermissionConfig } from "@/lib/db/queries";

/**
 * The full set of capabilities a user has. super_admin always has all of them.
 *
 * Wrapped in React `cache()`: layouts, pages, and `sectionNavProps` all call this
 * for the same `CurrentUser` (itself memoized by `getCurrentUser`) within one
 * request, so this dedupes the permission-config lookup per request. Outside a
 * React request scope (unit tests, route handlers) `cache()` is a pass-through.
 */
export const getCapabilities = cache(
  async (user: CurrentUser): Promise<Set<Capability>> => {
    if (user.role === "super_admin") return new Set(CAPABILITIES);
    const config = await getPermissionConfig();
    return new Set(config.capabilities[user.role] ?? []);
  },
);

export async function userCan(user: CurrentUser, capability: Capability): Promise<boolean> {
  if (user.role === "super_admin") return true;
  return (await getCapabilities(user)).has(capability);
}

/**
 * Route-handler guard: returns a 401/403 response to short-circuit with, or null
 * when the current user holds `capability`. Usage:
 *   const denied = await requireCapability("edit_settings");
 *   if (denied) return denied;
 *
 * The session helper is imported lazily so this module stays import-safe outside
 * a request context (e.g. in unit tests of the capability logic above).
 */
export async function requireCapability(capability: Capability): Promise<NextResponse | null> {
  const { getCurrentUser } = await import("./session");
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await userCan(user, capability))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Manager-only gate (admin + super_admin) for sensitive payroll operations that
 * aren't tied to a single capability — closing/reopening months and relabelling
 * a record's month. Returns `{ user }` on success or `{ error }` to short-circuit:
 *   const gate = await requireManager();
 *   if ("error" in gate) return gate.error;
 */
export async function requireManager(): Promise<{ user: CurrentUser } | { error: NextResponse }> {
  const { getCurrentUser } = await import("./session");
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "admin" && user.role !== "super_admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}
