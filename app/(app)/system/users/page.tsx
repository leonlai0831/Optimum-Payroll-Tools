import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { canViewUserRole } from "@/lib/auth/types";
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
  if (!(await userCan(user, "manage_users"))) redirect("/");

  const [userRecords, coaches, gymStaff] = await Promise.all([
    listUsers(),
    listCoaches(),
    listGymStaff(),
  ]);
  // Hierarchy scope: accounts ranked above the actor are invisible; same-rank
  // accounts render view-only (UserManager derives that from actorRole).
  const users: SafeUser[] = userRecords
    .filter((u) => canViewUserRole(user.role, u.role))
    .map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
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
      actorRole={user.role}
    />
  );
}
