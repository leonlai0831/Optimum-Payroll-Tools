import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

import { hashPassword, verifyPassword } from "./password";
import { getCapabilities, userCan } from "./permissions";
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
});

describe("capability matrix (default permission config)", () => {
  const asRole = (role: CurrentUser["role"]): CurrentUser => ({
    id: 1,
    email: "x@x",
    displayName: "",
    role,
    coachId: null,
    active: true,
  });

  it("super_admin holds every capability", async () => {
    const caps = await getCapabilities(asRole("super_admin"));
    expect(caps.has("manage_users")).toBe(true);
    expect(caps.has("edit_settings")).toBe(true);
  });

  it("admin edits data but not settings or users", async () => {
    const admin = asRole("admin");
    expect(await userCan(admin, "edit_staff")).toBe(true);
    expect(await userCan(admin, "run_kpi")).toBe(true);
    expect(await userCan(admin, "view_settings")).toBe(true);
    expect(await userCan(admin, "edit_settings")).toBe(false);
    expect(await userCan(admin, "manage_users")).toBe(false);
  });

  it("staff can only view its own profile", async () => {
    const staff = asRole("staff");
    expect(await userCan(staff, "view_own")).toBe(true);
    expect(await userCan(staff, "view_all_staff")).toBe(false);
    expect(await userCan(staff, "run_allowance")).toBe(false);
  });

  it("supervisor oversees and reviews the team but cannot administer", async () => {
    const sup = asRole("supervisor");
    expect(await userCan(sup, "view_all_staff")).toBe(true);
    expect(await userCan(sup, "edit_appraisals")).toBe(true);
    expect(await userCan(sup, "edit_notes")).toBe(true);
    expect(await userCan(sup, "run_kpi")).toBe(true);
    expect(await userCan(sup, "run_allowance")).toBe(true);
    // ...but not the administrative capabilities:
    expect(await userCan(sup, "edit_staff")).toBe(false);
    expect(await userCan(sup, "view_audit")).toBe(false);
    expect(await userCan(sup, "manage_users")).toBe(false);
    expect(await userCan(sup, "edit_settings")).toBe(false);
  });
});
