import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { listCoaches, listUsers } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { UserManager, type CoachOption, type SafeUser } from "@/components/user-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("manage_users")) redirect("/");

  const [userRecords, coaches] = await Promise.all([listUsers(), listCoaches()]);
  const users: SafeUser[] = userRecords.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    coachId: u.coachId,
    active: u.active,
  }));
  const coachOptions: CoachOption[] = coaches.map((c) => ({ id: c.id, name: c.canonicalName }));

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="staff" caps={[...caps]} isSuperAdmin={user.role === "super_admin"} />
      <UserManager
        users={users}
        coaches={coachOptions}
        actorId={user.id}
        actorIsSuperAdmin={user.role === "super_admin"}
      />
    </div>
  );
}
