import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandShell } from "@/components/brand-shell";
import { ToastProvider } from "@/components/toast";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <ToastProvider>
      <BrandShell email={user.email} role={user.role}>
        {children}
      </BrandShell>
    </ToastProvider>
  );
}
