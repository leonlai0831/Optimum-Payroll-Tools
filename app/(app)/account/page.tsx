import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AccountForm } from "@/components/account-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="fade-in mx-auto max-w-md space-y-4">
      <h1 className="text-h1 text-gray-900">My account</h1>
      <p className="text-body text-muted">Change your nickname, sign-in email, or password.</p>
      <AccountForm email={user.email} role={user.role} displayName={user.displayName} />
    </div>
  );
}
