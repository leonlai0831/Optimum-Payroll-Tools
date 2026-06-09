import { redirect } from "next/navigation";

// Bare /system lands on the first tab; the super_admin gate lives in the layout.
export default function SystemIndexPage() {
  redirect("/system/users");
}
