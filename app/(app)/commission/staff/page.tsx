import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getUnmatchedEarners, listGymStaff } from "@/lib/db/queries";
import { GymStaffRoster } from "@/components/gym-staff-roster";
import { UnmatchedEarners } from "@/components/unmatched-earners";

export const dynamic = "force-dynamic";

export default async function GymStaffPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const [staff, unmatched] = await Promise.all([listGymStaff(), getUnmatchedEarners()]);
  return (
    <div className="space-y-4">
      <GymStaffRoster staff={staff} canEdit={caps.has("edit_staff")} />
      <UnmatchedEarners earners={unmatched} />
    </div>
  );
}
