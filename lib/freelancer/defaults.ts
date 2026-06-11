import type { FreelancerConfig } from "./types";

/**
 * Default freelancer rates + bonus matrix, faithful to FREELANCER_CALCULATOR.xlsx.
 * Group A = town centers (HQ/BK/BT); group B = everywhere else. Every position
 * must appear in `rates` (TypeScript enforces totality).
 */
export const DEFAULT_FREELANCER_CONFIG: FreelancerConfig = {
  rates: {
    A1: { groupA: 12, groupB: 13 },
    A2: { groupA: 13, groupB: 14 },
    A3: { groupA: 14, groupB: 15 },
    PA: { groupA: 12, groupB: 14 },
    T0: { groupA: 14, groupB: 16 },
    T1: { groupA: 16, groupB: 18 },
    T2: { groupA: 18, groupB: 20 },
    T3: { groupA: 20, groupB: 23 },
    T4: { groupA: 23, groupB: 26 },
    I1: { groupA: 26, groupB: 30 },
  },
  groupACenters: ["HQ", "BK", "BT"],
  // VLOOKUP-style approximate match on both axes (largest threshold ≤ value).
  commitment: {
    hourThresholds: [0, 31, 41, 51],
    resultThresholds: [0, 0.7, 0.85],
    values: [
      [0, 0, 0],
      [0.05, 0.1, 0.15],
      [0.1, 0.15, 0.2],
      [0.15, 0.2, 0.25],
    ],
  },
  attendanceBonus: 0.2,
  entities: [
    { key: "OT", label: "OT", centers: ["HQ", "BK", "BT", "PK"] },
    { key: "OTG", label: "OTG", centers: ["KK", "USJ"] },
    { key: "PJ", label: "PJ", centers: ["PJ"] },
    { key: "QSM", label: "QSM", centers: ["QSM"] },
    { key: "KM", label: "KM", centers: ["KM"] },
  ],
};
