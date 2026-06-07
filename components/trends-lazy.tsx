"use client";

import dynamic from "next/dynamic";

/**
 * Lazy wrappers for the recharts-backed trends views. The trends pages are Server
 * Components, and `ssr: false` is only valid inside a Client Component — so this
 * "use client" module holds the dynamic imports. recharts (~290 KB) is then code-
 * split out of each trends route's initial bundle and fetched only once the page
 * shell has painted.
 */
const loading = () => <div className="h-72 w-full animate-pulse rounded-xl bg-gray-50" />;

export const TrendsView = dynamic(
  () => import("@/components/trends-view").then((m) => m.TrendsView),
  { ssr: false, loading },
);

export const AllowanceTrendsView = dynamic(
  () => import("@/components/allowance-trends-view").then((m) => m.AllowanceTrendsView),
  { ssr: false, loading },
);

export const TrendsTabs = dynamic(
  () => import("@/components/trends-tabs").then((m) => m.TrendsTabs),
  { ssr: false, loading },
);
