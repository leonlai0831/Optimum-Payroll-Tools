import Link from "next/link";
import {
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Dumbbell,
  HandCoins,
  ScrollText,
  ShieldCheck,
  TrendingUp,
  Trophy,
  UserCircle,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui";
import { CiWave } from "@/components/ci-wave";
import { HubStripeBand } from "@/components/hub-stripe-band";
import { ArrivalSlide } from "@/components/arrival-slide";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { TOOL_CATEGORY_LABELS, type Capability } from "@/lib/auth/types";
import type { Brand } from "@/components/brand-shell";
import { MARKETING_TOOLS } from "@/lib/marketing/tools";

type Tool = {
  href?: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  disabled?: boolean;
  cap?: Capability;
  /** Gate to super_admin only (on top of any cap). */
  superAdmin?: boolean;
  /** Which brand this tool belongs to on the launcher. Defaults to swim. */
  brand?: Brand;
};

const TOOLS: Tool[] = [
  {
    // Land on History first; the Calculator stays a tab inside the module.
    href: "/allowance/history",
    title: "Staff Allowance",
    subtitle: "Full-time staff monthly allowance · start of month",
    icon: Wallet,
    cap: "run_allowance",
  },
  {
    // Land on History first; the Calculator stays a tab inside the module.
    href: "/freelancer/history",
    title: "Freelancer Payment",
    subtitle: "Freelance instructor pay · hourly + bonuses",
    icon: HandCoins,
    cap: "run_freelancer",
  },
  {
    href: "/kpi/history",
    title: "Instructor KPI Bonus",
    subtitle: "Instructor KPI score & bonus · ~mid-month",
    icon: Trophy,
    cap: "run_kpi",
  },
  {
    href: "/progress",
    title: "Student Progress",
    subtitle: "Monthly student data · API push or manual upload",
    icon: TrendingUp,
    cap: "run_kpi",
  },
  {
    href: "/staff",
    title: "Workforce",
    subtitle: "Full-time & freelance directory, profiles & notes",
    icon: Users,
    cap: "swim_view_staff",
  },
  {
    href: "/assessment",
    title: "Instructor Assessment",
    subtitle: "Observation form · scores feed the KPI bonus",
    icon: ClipboardCheck,
    cap: "edit_appraisals",
  },
  {
    // Land on History first (like the calculators); "New plan" stays a tab inside.
    href: "/lesson-plans/history",
    title: "Lesson Plan",
    subtitle: "Class planning · actual & replacement lessons",
    icon: ClipboardList,
    cap: "edit_lesson_plans",
  },
  {
    title: "Admin KPI Bonus",
    subtitle: "Coming soon",
    icon: ShieldCheck,
    disabled: true,
    cap: "run_kpi",
  },
  {
    href: "/commission",
    title: "Staff Earnings",
    subtitle: "Gym staff pay · commission, coaching income & bonuses",
    icon: Dumbbell,
    cap: "run_commission",
    brand: "fit",
  },
  {
    href: "/system/users",
    title: "Users",
    subtitle: "Accounts, roles & staff links",
    icon: UserCog,
    // Hierarchy-scoped: a manage_users holder administers only roles below
    // their own (the other System cards stay super_admin-only).
    cap: "manage_users",
    brand: "system",
  },
  {
    href: "/system/audit",
    title: "Audit log",
    subtitle: "History of sensitive changes",
    icon: ScrollText,
    superAdmin: true,
    brand: "system",
  },
  {
    href: "/system/permissions",
    title: "Permissions",
    subtitle: "Role capabilities, launcher categories & user overrides",
    icon: ShieldCheck,
    superAdmin: true,
    brand: "system",
  },
];

/** Launcher groups, in display order. Labels for the assignable categories come
 * from TOOL_CATEGORY_LABELS so the Permissions page can never drift. */
const BRAND_GROUPS: { brand: Brand; label: string }[] = [
  { brand: "swim", label: TOOL_CATEGORY_LABELS.swim },
  { brand: "fit", label: TOOL_CATEGORY_LABELS.fit },
  { brand: "marketing", label: TOOL_CATEGORY_LABELS.marketing },
  { brand: "system", label: "System Setting" },
];

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const disabled = tool.disabled || !tool.href;
  const body = (
    <Card
      className={cn(
        "group h-full p-5 transition-all duration-150",
        disabled
          ? "opacity-60"
          : "hover:-translate-y-0.5 hover:border-brand hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
            disabled
              ? "bg-gray-100 text-gray-400"
              : "bg-brand-light text-brand group-hover:bg-brand group-hover:text-white",
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        {disabled ? (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
            Soon
          </span>
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand" />
        )}
      </div>
      <div className="mt-3 text-base font-bold text-gray-900">{tool.title}</div>
      <p className="mt-1 text-sm text-gray-500">{tool.subtitle}</p>
    </Card>
  );

  return disabled ? (
    <div aria-disabled className="cursor-not-allowed">
      {body}
    </div>
  ) : (
    <Link href={tool.href!} className="block">
      {body}
    </Link>
  );
}

export const dynamic = "force-dynamic";

export default async function HubPage() {
  const user = await getCurrentUser();
  const caps = user ? await getCapabilities(user) : new Set<Capability>();
  const isSuperAdmin = user?.role === "super_admin";
  // Launcher categories (System Setting → Permissions): non-super-admins only
  // see the brand groups effective on their account — role default or per-user
  // override, already resolved by getCurrentUser(); super_admin short-circuits
  // and always sees everything (including the superAdmin-gated System group).
  const visibleBrands = new Set<Brand>(user?.visibleCategories ?? []);
  // The Marketing group's cards are owned by the marketing sandbox
  // (lib/marketing/tools.ts), so that module can add cards without touching this
  // shared launcher. Everything else is defined in TOOLS above.
  const tools = [
    ...TOOLS,
    ...MARKETING_TOOLS.map((t): Tool => ({ ...t, brand: "marketing" })),
  ].filter(
    (tool) =>
      (!tool.cap || caps.has(tool.cap)) &&
      (!tool.superAdmin || isSuperAdmin) &&
      // "system" is not an assignable launcher category — its cards are gated
      // purely by cap/superAdmin above (e.g. hierarchy-scoped manage_users).
      (isSuperAdmin || tool.brand === "system" || visibleBrands.has(tool.brand ?? "swim")),
  );
  // The user's own profile is not a category tool — it stays reachable in its
  // own group even when every brand category is hidden for the account.
  const profileTool: Tool | null =
    user?.coachId && caps.has("view_own")
      ? {
          href: `/staff/${user.coachId}`,
          title: "My Profile",
          subtitle: "Your performance record",
          icon: UserCircle,
        }
      : null;

  return (
    // ArrivalSlide is the page root: it descends from above when coming from
    // sign-in (the second half of the login camera-pan), plain fade-in
    // otherwise.
    <ArrivalSlide>
      {/* The permanent racing-stripe ribbon (bottom-right → up → behind the
          hero → out the left edge). Rendered BEFORE the hero so its bend
          hides behind the opaque card (id="hub-hero" below); every visit
          plays its draw-in. */}
      <HubStripeBand />
      {/* The one brand "splash" moment, photocopied from a CI guide page:
          white sheet, Brand Blue heading, the guide's own footer wave (traced
          1:1 from its vector artwork). Everything below stays quiet chrome. */}
      <section
        id="hub-hero"
        className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white px-6 pt-7 pb-20 shadow-card sm:px-8 sm:pb-24"
      >
        {user && (
          <p className="text-overline text-gray-400">
            Welcome, {user.displayName.trim() || user.email.split("@")[0]}
          </p>
        )}
        <h1 className="text-display mt-1 text-brand">Optimum People Hub</h1>
        <p className="mt-2 text-body text-muted">Choose a tool to get started.</p>
        <CiWave className="absolute inset-x-0 bottom-0 h-16 w-full sm:h-20" />
      </section>

      {tools.length === 0 && !profileTool ? (
        <Card className="p-6 text-sm text-gray-500">
          No tools are available for your account yet. An admin can adjust your
          role&apos;s permissions or your category visibility.
        </Card>
      ) : (
        <>
          {BRAND_GROUPS.map(({ brand, label }) => {
            const group = tools.filter((t) => (t.brand ?? "swim") === brand);
            if (group.length === 0) return null;
            return (
              // data-brand re-skins this group's cards (the Fit group renders black/yellow).
              <section key={brand} data-brand={brand} className="space-y-3">
                <h2 className="text-overline text-gray-400">{label}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((tool) => (
                    <ToolCard key={tool.title} tool={tool} />
                  ))}
                </div>
              </section>
            );
          })}
          {profileTool && (
            <section className="space-y-3">
              <h2 className="text-overline text-gray-400">Personal</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ToolCard tool={profileTool} />
              </div>
            </section>
          )}
        </>
      )}
    </ArrivalSlide>
  );
}
