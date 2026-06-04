import { NextResponse } from "next/server";

export type EmployeeLink = { coachId: number | null; gymStaffId: number | null };

/**
 * Normalize + validate the employee link on a user-write request. A login may
 * link to a Swim coach (`coachId`) OR an Optimum Fit gym-staff member
 * (`gymStaffId`), never both. Returns the resolved pair, or `{ error }`
 * (HTTP 400) to short-circuit.
 *
 * Absent keys resolve to `null`, so setting one side clears the other — which is
 * exactly the exclusivity we want: the User-accounts UI sends both keys together
 * when the link changes, and create sets the link wholesale. PATCH must only call
 * this when the request actually touches the link (see /api/users/[id]).
 */
export function resolveEmployeeLink(body: {
  coachId?: number | null;
  gymStaffId?: number | null;
}): EmployeeLink | { error: NextResponse } {
  const coachId = body.coachId == null ? null : Number(body.coachId);
  const gymStaffId = body.gymStaffId == null ? null : Number(body.gymStaffId);
  if (coachId != null && gymStaffId != null) {
    return {
      error: NextResponse.json(
        { error: "A login can link to a coach or a gym-staff member, not both." },
        { status: 400 },
      ),
    };
  }
  return { coachId, gymStaffId };
}
