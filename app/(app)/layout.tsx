import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Nav } from "@/components/nav";
import { ToastProvider } from "@/components/toast";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <ToastProvider>
      <Nav email={user.email} role={user.role} />
      <main className="mx-auto max-w-7xl p-4 md:p-6">{children}</main>
    </ToastProvider>
  );
}
