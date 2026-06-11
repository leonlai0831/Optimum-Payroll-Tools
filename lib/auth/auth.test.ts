import { afterEach, beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

import { hashPassword, verifyPassword } from "./password";
import { getCapabilities, userCan } from "./permissions";
import { resolveSessionPassword } from "./session";
import {
  ALL_TOOL_CATEGORIES,
  ROLES,
  canManageUserRole,
  canViewUserRole,
  effectiveCategories,
  sanitizeToolCategories,
  type PermissionConfig,
} from "./types";
import type { CurrentUser } from "./session";

describe("password hashing", () => {
  it("round-trips a password and rejects wrong/malformed input", () => {
    const stored = hashPassword("swim123");
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(verifyPassword("swim123", stored)).toBe(true);
    expect(verifyPassword("nope", stored)).toBe(false);
    expect(verifyPassword("swim123", "garbage")).toBe(false);
  });

  it("uses a random salt so the same password hashes differently", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });
});

describe("user accounts (PGlite in-memory)", () => {
  let queries: typeof import("../db/queries");
  beforeAll(async () => {
    queries = await import("../db/queries");
  });

  it("ensureSuperAdmin seeds exactly one super_admin, idempotently", async () => {
    await queries.ensureSuperAdmin();
    await queries.ensureSuperAdmin();
    const supers = (await queries.listUsers()).filter((u) => u.role === "super_admin");
    expect(supers.length).toBe(1);
    expect(supers[0].email).toBe("admin@local");
  });

  it("creates users, lowercases the email, and enforces uniqueness", async () => {
    const u = await queries.createUser({
      email: "Coach.A@Optimum.Page",
      password: "pw-a",
      role: "staff",
    });
    expect(u.email).toBe("coach.a@optimum.page");
    expect(await queries.getUserByEmail("COACH.A@optimum.page")).toBeTruthy();
    await expect(
      queries.createUser({ email: "coach.a@optimum.page", password: "x", role: "staff" }),
    ).rejects.toThrow(/already exists/i);
  });

  it("updates a password so the new one verifies and the old one fails", async () => {
    const u = await queries.createUser({ email: "pw@x.io", password: "old", role: "admin" });
    await queries.updateUser(u.id, { password: "new" });
    const reread = await queries.getUserById(u.id);
    expect(verifyPassword("new", reread!.passwordHash)).toBe(true);
    expect(verifyPassword("old", reread!.passwordHash)).toBe(false);
  });

  it("updateUser changes a user's email and normalizes the new value", async () => {
    const u = await queries.createUser({ email: "old@x.io", password: "pw", role: "staff" });
    await queries.updateUser(u.id, { email: "  NEW@X.IO  " });
    const reread = await queries.getUserById(u.id);
    expect(reread!.email).toBe("new@x.io");
  });

  it("updateUser rejects an email already taken by another user", async () => {
    await queries.createUser({ email: "taken@x.io", password: "pw", role: "staff" });
    const u = await queries.createUser({ email: "mine@x.io", password: "pw", role: "staff" });
    await expect(queries.updateUser(u.id, { email: "TAKEN@X.IO" })).rejects.toThrow(
      /already exists/i,
    );
  });

  it("updateUser lets a user keep their own email (no false collision)", async () => {
    const u = await queries.createUser({ email: "self@x.io", password: "pw", role: "staff" });
    // Setting to the same address (any casing) must not raise "already exists".
    await queries.updateUser(u.id, { email: "SELF@X.IO" });
    const reread = await queries.getUserById(u.id);
    expect(reread!.email).toBe("self@x.io");
  });

  it("updateUser can change email and password in one call without clobbering either", async () => {
    const u = await queries.createUser({ email: "both@x.io", password: "old-pw", role: "staff" });
    await queries.updateUser(u.id, { email: "both-new@x.io", password: "new-pw" });
    const reread = await queries.getUserById(u.id);
    expect(reread!.email).toBe("both-new@x.io");
    expect(verifyPassword("new-pw", reread!.passwordHash)).toBe(true);
    expect(verifyPassword("old-pw", reread!.passwordHash)).toBe(false);
  });

  it("links a login to a gym-staff record and switches coach/gym exclusively", async () => {
    // Create linked to an Optimum Fit gym-staff record (Phase 4).
    const u = await queries.createUser({
      email: "fit-link@x.io",
      password: "pw",
      role: "staff",
      gymStaffId: 42,
    });
    expect(u.gymStaffId).toBe(42);
    expect(u.coachId).toBeNull();

    // Switching to a Swim coach clears the gym link…
    await queries.updateUser(u.id, { coachId: 7, gymStaffId: null });
    let reread = await queries.getUserById(u.id);
    expect(reread!.coachId).toBe(7);
    expect(reread!.gymStaffId).toBeNull();

    // …and switching back to gym clears the coach link.
    await queries.updateUser(u.id, { coachId: null, gymStaffId: 99 });
    reread = await queries.getUserById(u.id);
    expect(reread!.gymStaffId).toBe(99);
    expect(reread!.coachId).toBeNull();
  });

  it("createUser can pin a category override at creation", async () => {
    const u = await queries.createUser({
      email: "cat-create@x.io",
      password: "pw",
      role: "staff",
      visibleCategories: ["marketing"],
    });
    expect(u.visibleCategories).toEqual(["marketing"]);
  });

  it("new users default to NULL (inherit role default); updateUser overrides and resets", async () => {
    // Omitted at creation → NULL → the account inherits its role's categories,
    // so effective = the role default from the permission matrix.
    const u = await queries.createUser({ email: "cat@x.io", password: "pw", role: "staff" });
    expect(u.visibleCategories).toBeNull();
    const config = await queries.getPermissionConfig();
    expect(effectiveCategories(u.role, u.visibleCategories, config.categories)).toEqual(
      config.categories.staff,
    );

    await queries.updateUser(u.id, { visibleCategories: ["fit"] });
    let reread = await queries.getUserById(u.id);
    expect(reread!.visibleCategories).toEqual(["fit"]);

    // An empty list is a valid override (account sees no category groups).
    await queries.updateUser(u.id, { visibleCategories: [] });
    reread = await queries.getUserById(u.id);
    expect(reread!.visibleCategories).toEqual([]);

    // null resets the override → inherit the role default again.
    await queries.updateUser(u.id, { visibleCategories: null });
    reread = await queries.getUserById(u.id);
    expect(reread!.visibleCategories).toBeNull();
  });
});

describe("effectiveCategories (override ?? role default; super_admin all)", () => {
  const defaults: PermissionConfig["categories"] = {
    admin: [...ALL_TOOL_CATEGORIES],
    supervisor: ["swim"],
    staff: ["fit"],
  };

  it("inherits the role default when the override is null/undefined", () => {
    expect(effectiveCategories("staff", null, defaults)).toEqual(["fit"]);
    expect(effectiveCategories("supervisor", undefined, defaults)).toEqual(["swim"]);
  });

  it("a per-user override wins over the role default (even an empty one)", () => {
    expect(effectiveCategories("staff", ["swim", "marketing"], defaults)).toEqual([
      "swim",
      "marketing",
    ]);
    expect(effectiveCategories("admin", [], defaults)).toEqual([]);
  });

  it("super_admin always sees every category, override or not", () => {
    expect(effectiveCategories("super_admin", null, defaults)).toEqual(ALL_TOOL_CATEGORIES);
    expect(effectiveCategories("super_admin", ["fit"], defaults)).toEqual(ALL_TOOL_CATEGORIES);
  });
});

describe("sanitizeToolCategories", () => {
  it("accepts valid lists, deduping and restoring canonical order", () => {
    expect(sanitizeToolCategories(["marketing", "swim", "swim"])).toEqual(["swim", "marketing"]);
    expect(sanitizeToolCategories([])).toEqual([]);
    expect(sanitizeToolCategories(ALL_TOOL_CATEGORIES)).toEqual(["swim", "fit", "marketing"]);
  });

  it("rejects non-arrays and unknown categories", () => {
    expect(sanitizeToolCategories("swim")).toBeNull();
    expect(sanitizeToolCategories(undefined)).toBeNull();
    expect(sanitizeToolCategories(["swim", "system"])).toBeNull();
    expect(sanitizeToolCategories(["gym"])).toBeNull();
  });
});

describe("user-management hierarchy (manage_users scope)", () => {
  it("manages strictly below own rank only — same rank is view-only, higher is hidden", () => {
    // admin: manages supervisor+staff, views fellow admins, never sees super_admins.
    expect(canManageUserRole("admin", "supervisor")).toBe(true);
    expect(canManageUserRole("admin", "staff")).toBe(true);
    expect(canManageUserRole("admin", "admin")).toBe(false);
    expect(canViewUserRole("admin", "admin")).toBe(true);
    expect(canViewUserRole("admin", "super_admin")).toBe(false);

    // supervisor: manages staff only, views fellow supervisors.
    expect(canManageUserRole("supervisor", "staff")).toBe(true);
    expect(canManageUserRole("supervisor", "supervisor")).toBe(false);
    expect(canViewUserRole("supervisor", "supervisor")).toBe(true);
    expect(canViewUserRole("supervisor", "admin")).toBe(false);

    // staff: manages nobody (no rank below), views only fellow staff.
    expect(ROLES.filter((r) => canManageUserRole("staff", r))).toEqual([]);
    expect(ROLES.filter((r) => canViewUserRole("staff", r))).toEqual(["staff"]);
  });

  it("super_admin is all-access, including over fellow super_admins", () => {
    for (const r of ROLES) {
      expect(canViewUserRole("super_admin", r)).toBe(true);
      expect(canManageUserRole("super_admin", r)).toBe(true);
    }
  });
});

describe("capability matrix (default permission config)", () => {
  const asRole = (role: CurrentUser["role"]): CurrentUser => ({
    id: 1,
    email: "x@x",
    displayName: "",
    role,
    coachId: null,
    gymStaffId: null,
    visibleCategories: ALL_TOOL_CATEGORIES,
    active: true,
  });

  it("super_admin holds every capability", async () => {
    const caps = await getCapabilities(asRole("super_admin"));
    expect(caps.has("manage_users")).toBe(true);
    expect(caps.has("swim_edit_settings")).toBe(true);
    expect(caps.has("fit_edit_settings")).toBe(true);
  });

  it("admin edits data but not settings or users", async () => {
    const admin = asRole("admin");
    // Staff/settings access is brand-scoped; admin defaults hold both brands.
    expect(await userCan(admin, "swim_edit_staff")).toBe(true);
    expect(await userCan(admin, "fit_edit_staff")).toBe(true);
    expect(await userCan(admin, "run_kpi")).toBe(true);
    // Deleting a saved KPI month (DELETE /api/runs/[id]) is gated on finalize_kpi.
    expect(await userCan(admin, "finalize_kpi")).toBe(true);
    expect(await userCan(admin, "swim_view_settings")).toBe(true);
    expect(await userCan(admin, "fit_view_settings")).toBe(true);
    expect(await userCan(admin, "swim_edit_settings")).toBe(false);
    expect(await userCan(admin, "fit_edit_settings")).toBe(false);
    expect(await userCan(admin, "manage_users")).toBe(false);
  });

  it("staff can only view its own profile", async () => {
    const staff = asRole("staff");
    expect(await userCan(staff, "view_own")).toBe(true);
    // Gates the staff directories + other staff's earnings pages
    // (view_own only grants the staff member's own profile/earnings).
    expect(await userCan(staff, "swim_view_staff")).toBe(false);
    expect(await userCan(staff, "fit_view_staff")).toBe(false);
    expect(await userCan(staff, "run_allowance")).toBe(false);
  });

  it("supervisor oversees and reviews the team but cannot administer", async () => {
    const sup = asRole("supervisor");
    expect(await userCan(sup, "swim_view_staff")).toBe(true);
    expect(await userCan(sup, "fit_view_staff")).toBe(true);
    expect(await userCan(sup, "edit_appraisals")).toBe(true);
    expect(await userCan(sup, "edit_notes")).toBe(true);
    expect(await userCan(sup, "run_kpi")).toBe(true);
    expect(await userCan(sup, "run_allowance")).toBe(true);
    // ...but not the administrative capabilities:
    // run_kpi alone must NOT allow deleting a saved month (DELETE /api/runs/[id]).
    expect(await userCan(sup, "finalize_kpi")).toBe(false);
    expect(await userCan(sup, "swim_edit_staff")).toBe(false);
    expect(await userCan(sup, "fit_edit_staff")).toBe(false);
    expect(await userCan(sup, "view_audit")).toBe(false);
    expect(await userCan(sup, "manage_users")).toBe(false);
    expect(await userCan(sup, "swim_edit_settings")).toBe(false);
    expect(await userCan(sup, "fit_edit_settings")).toBe(false);
  });
});

describe("resolveSessionPassword", () => {
  const orig = { secret: process.env.SESSION_SECRET, env: process.env.NODE_ENV, phase: process.env.NEXT_PHASE };
  const set = (k: string, v: string | undefined) => {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  };
  afterEach(() => {
    set("SESSION_SECRET", orig.secret);
    set("NODE_ENV", orig.env);
    set("NEXT_PHASE", orig.phase);
  });

  it("returns a valid 32+ char secret in any environment", () => {
    const secret = "x".repeat(40);
    set("SESSION_SECRET", secret);
    set("NODE_ENV", "production");
    set("NEXT_PHASE", undefined);
    expect(resolveSessionPassword()).toBe(secret);
  });

  it("throws in production when the secret is missing or too short", () => {
    set("NODE_ENV", "production");
    set("NEXT_PHASE", undefined);
    set("SESSION_SECRET", undefined);
    expect(() => resolveSessionPassword()).toThrow(/SESSION_SECRET is required/);
    set("SESSION_SECRET", "too-short");
    expect(() => resolveSessionPassword()).toThrow(/at least 32/);
  });

  it("does NOT throw during next build (phase-production-build), so a build needs no secret", () => {
    set("NODE_ENV", "production");
    set("NEXT_PHASE", "phase-production-build");
    set("SESSION_SECRET", undefined);
    expect(() => resolveSessionPassword()).not.toThrow();
  });

  it("falls back to the dev constant outside production (no setup needed)", () => {
    set("NODE_ENV", "development");
    set("SESSION_SECRET", undefined);
    expect(resolveSessionPassword()).toMatch(/dev-only-insecure/);
  });
});
