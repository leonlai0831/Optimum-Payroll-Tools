import type { TeachingConfig } from "./types";

/** v1 coaching-income rates from the Optimum Fit spec (editable in Settings). */
export const DEFAULT_TEACHING_CONFIG: TeachingConfig = {
  ptRate: 30, // RM per PT attendee
  groupRate: 75, // RM per group-class session
  ptKeywords: ["appointment"], // "Fitness Appointment Classes" → PT
};

export function defaultTeachingConfig(): TeachingConfig {
  return structuredClone(DEFAULT_TEACHING_CONFIG);
}
