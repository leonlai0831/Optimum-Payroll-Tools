import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Nav } from "@/components/nav";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session.authenticated) redirect("/login");

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl p-4 md:p-6">{children}</main>
    </>
  );
}
