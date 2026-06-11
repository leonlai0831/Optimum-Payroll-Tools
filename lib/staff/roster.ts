import type { CoachRecord } from "@/lib/db/schema";

/**
 * Which slice of the manpower directory a module may search. The directory
 * holds BOTH employment kinds, but pay modules are exclusive — a freelancer
 * is paid through Freelancer Payment only, a full-timer through Allowance /
 * KPI Bonus only — while observation surfaces (Assessment, Lesson Plan) see
 * every INSTRUCTOR regardless of employment type, never front desk.
 */
export type RosterModule = "freelancer" | "allowance" | "kpi" | "assessment";

type RosterCoachFields = Pick<CoachRecord, "employmentType" | "jobRole" | "active">;

export function rosterCoachesFor<T extends RosterCoachFields>(
  module: RosterModule,
  coaches: T[],
): T[] {
  const active = coaches.filter((c) => c.active);
  switch (module) {
    case "freelancer":
      return active.filter((c) => c.employmentType === "freelancer");
    case "allowance":
    case "kpi":
      return active.filter((c) => c.employmentType !== "freelancer");
    case "assessment":
      return active.filter((c) => c.jobRole === "instructor");
  }
}
