import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { getUnmatchedEarners, listGymStaff } from "@/lib/db/queries";
import { GymStaffView } from "@/components/gym-staff-view";

export const dynamic = "force-dynamic";

export default async function GymStaffPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);

  // The directory lists every gym staff member's profile — same gate as /staff.
  if (!caps.has("view_all_staff")) redirect("/");

  const [staff, unmatched] = await Promise.all([listGymStaff(), getUnmatchedEarners()]);
  return <GymStaffView staff={staff} canEdit={caps.has("edit_staff")} unmatched={unmatched} />;
}
