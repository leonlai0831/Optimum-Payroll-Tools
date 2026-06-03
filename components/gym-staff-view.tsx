"use client";

import { useRef } from "react";
import { GymStaffRoster, type StaffRosterHandle } from "@/components/gym-staff-roster";
import { UnmatchedEarners } from "@/components/unmatched-earners";
import type { GymStaffRecord } from "@/lib/db/schema";
import type { UnmatchedEarner } from "@/lib/earnings/income";

/**
 * Staff page body: the roster + the unmatched-income coverage check. An "Add"
 * click on an unmatched row pre-fills the roster's add form above (via the
 * roster's imperative handle).
 */
export function GymStaffView({
  staff,
  canEdit,
  unmatched,
}: {
  staff: GymStaffRecord[];
  canEdit: boolean;
  unmatched: UnmatchedEarner[];
}) {
  const rosterRef = useRef<StaffRosterHandle>(null);
  return (
    <div className="space-y-4">
      <GymStaffRoster ref={rosterRef} staff={staff} canEdit={canEdit} />
      <UnmatchedEarners
        earners={unmatched}
        canEdit={canEdit}
        onAdd={(e) => rosterRef.current?.prefillAdd({ name: e.name, staffCode: e.staffCode })}
      />
    </div>
  );
}
