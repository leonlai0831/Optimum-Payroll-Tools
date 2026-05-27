import { NextResponse } from "next/server";
import type { CurrentUser } from "./session";
import { CAPABILITIES, type Capability } from "./types";
import { getPermissionConfig } from "@/lib/db/queries";

/** The full set of capabilities a user has. super_admin always has all of them. */
export async function getCapabilities(user: CurrentUser): Promise<Set<Capability>> {
  if (user.role === "super_admin") return new Set(CAPABILITIES);
  const config = await getPermissionConfig();
  return new Set(config[user.role] ?? []);
}

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
