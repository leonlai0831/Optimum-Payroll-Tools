import type { PerformanceConfig } from "./types";

/** Seed appraisal dimensions (editable via the Staff → Options page). */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  dimensions: [
    { key: "teaching_quality", label: "Teaching Quality" },
    { key: "communication", label: "Communication" },
    { key: "safety", label: "Safety" },
    { key: "teamwork", label: "Teamwork" },
    { key: "initiative", label: "Initiative" },
  ],
};
