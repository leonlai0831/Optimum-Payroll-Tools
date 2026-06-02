import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { listGymStaff } from "@/lib/db/queries";
import { GymStaffRoster } from "@/components/gym-staff-roster";

export const dynamic = "force-dynamic";

export default async function GymStaffPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  const [staff] = await Promise.all([listGymStaff()]);
  return <GymStaffRoster staff={staff} canEdit={caps.has("edit_staff")} />;
}
