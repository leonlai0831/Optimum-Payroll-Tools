import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { listCoaches, listGymStaff, listUsers } from "@/lib/db/queries";
import {
  UserManager,
  type CoachOption,
  type GymStaffOption,
  type SafeUser,
} from "@/components/user-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("manage_users")) redirect("/");

  const [userRecords, coaches, gymStaff] = await Promise.all([
    listUsers(),
    listCoaches(),
    listGymStaff(),
  ]);
  const users: SafeUser[] = userRecords.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    coachId: u.coachId,
    gymStaffId: u.gymStaffId,
    active: u.active,
  }));
  const coachOptions: CoachOption[] = coaches.map((c) => ({ id: c.id, name: c.canonicalName }));
  const gymStaffOptions: GymStaffOption[] = gymStaff.map((g) => ({ id: g.id, name: g.name }));

  return (
    <UserManager
      users={users}
      coaches={coachOptions}
      gymStaff={gymStaffOptions}
      actorId={user.id}
      actorIsSuperAdmin={user.role === "super_admin"}
    />
  );
}
