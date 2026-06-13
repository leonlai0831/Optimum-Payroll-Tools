import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { FreelancerScheduleEditor } from "@/components/freelancer-schedule-editor";

export const dynamic = "force-dynamic";

/** Admin maintenance of a freelancer's fixed weekly schedule (the validator that
 *  auto-classifies their clock-ins into fixed / replaced / absent). */
export default async function SchedulesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("manage_freelancer_schedule")) redirect("/timesheets");
  return <FreelancerScheduleEditor />;
}
