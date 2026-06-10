import type { LucideIcon } from "lucide-react";
import { Megaphone } from "lucide-react";

/**
 * Cards shown under the "Optimum Marketing" group on the home launcher.
 *
 * Add as many as you want — each entry becomes a card. Point `href` at a route
 * you build under `app/(app)/marketing/…`. This file lives in the marketing
 * sandbox, so you register cards here WITHOUT touching the shared launcher
 * (`app/(app)/page.tsx`).
 *
 * `icon` is any icon from `lucide-react`. Set `disabled: true` to show a
 * greyed-out "Soon" card with no link.
 */
export type MarketingTool = {
  href: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  disabled?: boolean;
};

export const MARKETING_TOOLS: MarketingTool[] = [
  {
    href: "/marketing",
    title: "Marketing KPI",
    subtitle: "Coming soon",
    icon: Megaphone,
    disabled: true,
  },
  // Add more cards here, e.g.:
  // {
  //   href: "/marketing/campaigns",
  //   title: "Campaigns",
  //   subtitle: "Campaign spend & ROI",
  //   icon: Target, // import it from "lucide-react" above
  // },
];
