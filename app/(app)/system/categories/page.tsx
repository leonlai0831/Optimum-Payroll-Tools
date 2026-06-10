import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/db/queries";
import {
  CategoryVisibilityManager,
  type CategoryUser,
} from "@/components/category-visibility-manager";

export const dynamic = "force-dynamic";

export default async function CategoryVisibilityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect("/");

  const users: CategoryUser[] = (await listUsers()).map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    visibleCategories: u.visibleCategories,
    active: u.active,
  }));

  return <CategoryVisibilityManager users={users} />;
}
