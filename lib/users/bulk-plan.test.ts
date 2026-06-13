import { describe, expect, it } from "vitest";
import { planBulkUsers, type ExistingAccount } from "./bulk-plan";

const existing: ExistingAccount[] = [
  { id: 1, email: "boss@x.com", role: "super_admin" },
  { id: 2, email: "Manager@x.com", role: "admin" },
  { id: 3, email: "lead@x.com", role: "supervisor" },
  { id: 4, email: "coach@x.com", role: "staff" },
];

const adminActor = { actorId: 2, actorRole: "admin" as const };

describe("planBulkUsers", () => {
  it("creates brand-new emails regardless of mode", () => {
    const plan = planBulkUsers({
      rows: [{ email: "new@x.com", name: "New Person" }],
      existing,
      ...adminActor,
      mode: "skip",
    });
    expect(plan.toCreate).toEqual([{ email: "new@x.com", name: "New Person" }]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips an existing email in skip mode", () => {
    const plan = planBulkUsers({
      rows: [{ email: "coach@x.com", name: "Coach" }],
      existing,
      ...adminActor,
      mode: "skip",
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.skipped).toEqual([{ email: "coach@x.com", reason: "already exists" }]);
  });

  it("overwrites a manageable existing email in overwrite mode", () => {
    const plan = planBulkUsers({
      rows: [{ email: "coach@x.com", name: "Coach Updated" }],
      existing,
      ...adminActor,
      mode: "overwrite",
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([{ id: 4, email: "coach@x.com", name: "Coach Updated" }]);
    expect(plan.skipped).toEqual([]);
  });

  it("matches existing emails case-insensitively", () => {
    const plan = planBulkUsers({
      rows: [{ email: "MANAGER@x.com", name: "M" }],
      existing,
      actorId: 1,
      actorRole: "super_admin",
      mode: "overwrite",
    });
    expect(plan.toUpdate).toEqual([{ id: 2, email: "MANAGER@x.com", name: "M" }]);
  });

  it("never overwrites the actor's own account", () => {
    const plan = planBulkUsers({
      rows: [{ email: "Manager@x.com", name: "Me" }],
      existing,
      ...adminActor, // actorId 2 == Manager@x.com
      mode: "overwrite",
    });
    expect(plan.toUpdate).toEqual([]);
    expect(plan.skipped).toEqual([{ email: "Manager@x.com", reason: "your own account" }]);
  });

  it("never overwrites an account at or above the actor's access", () => {
    const plan = planBulkUsers({
      rows: [
        { email: "boss@x.com", name: "B" }, // super_admin — above an admin
        { email: "lead@x.com", name: "L" }, // supervisor — below
      ],
      existing,
      ...adminActor,
      mode: "overwrite",
    });
    expect(plan.toUpdate).toEqual([{ id: 3, email: "lead@x.com", name: "L" }]);
    expect(plan.skipped).toEqual([{ email: "boss@x.com", reason: "exists — above your access" }]);
  });

  it("a super_admin may overwrite a peer super_admin (but not itself)", () => {
    const plan = planBulkUsers({
      rows: [{ email: "boss@x.com", name: "B" }],
      existing,
      actorId: 99, // a different super_admin
      actorRole: "super_admin",
      mode: "overwrite",
    });
    expect(plan.toUpdate).toEqual([{ id: 1, email: "boss@x.com", name: "B" }]);
  });

  it("skips in-file duplicates (first wins), independent of existence", () => {
    const plan = planBulkUsers({
      rows: [
        { email: "new@x.com", name: "First" },
        { email: "NEW@x.com", name: "Second" },
      ],
      existing,
      ...adminActor,
      mode: "skip",
    });
    expect(plan.toCreate).toEqual([{ email: "new@x.com", name: "First" }]);
    expect(plan.skipped).toEqual([{ email: "NEW@x.com", reason: "duplicate in list" }]);
  });

  it("ignores rows without an email and trims fields", () => {
    const plan = planBulkUsers({
      rows: [
        { email: "  ", name: "Blank" },
        { email: "  spaced@x.com  ", name: "  Spaced  " },
      ],
      existing,
      ...adminActor,
      mode: "skip",
    });
    expect(plan.toCreate).toEqual([{ email: "spaced@x.com", name: "Spaced" }]);
    expect(plan.skipped).toEqual([]);
  });
});
