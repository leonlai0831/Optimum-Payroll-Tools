import { aggregateData, calculateScores, computeGroupScore, getGrade } from "./calc";
import type { AppConfig, BreakdownItem, InstructorRow } from "./types";
import type { GroupConfig, Position } from "@/lib/types";

export interface CoachInputs {
  position: Position;
  teachingAllowance: number | null;
  mgmtAssessment: number | null;
  groupConfig: GroupConfig | null;
}

export interface CoachComputation {
  students: number;
  personalScore: number;
  groupScore: number;
  finalScore: number;
  grade: string;
  gradeClass: string;
  payout: number;
  breakdown: BreakdownItem[];
  isComplete: boolean;
  missing: string[];
}

/** Compute a single coach's scores + payout + readiness from merged accounts and inputs. */
export function computeCoach(opts: {
  accounts: string[];
  rows: InstructorRow[];
  config: AppConfig;
  inputs: CoachInputs;
}): CoachComputation {
  const { accounts, rows, config, inputs } = opts;
  const agg = aggregateData(rows, accounts);
  const mgmtRating = inputs.mgmtAssessment ?? 0;
  const personal = calculateScores(agg, config.personalKpi, mgmtRating);

  const isSupervisor = inputs.position === "Pool Supervisor";
  const hasGroup = !!inputs.groupConfig?.center1;
  let groupScore = 0;
  if (isSupervisor && hasGroup && inputs.groupConfig) {
    groupScore = computeGroupScore({
      rows,
      centerKpi: config.centerKpi,
      centerTargets: config.centerTargets,
      center1: inputs.groupConfig.center1,
      hours1: inputs.groupConfig.hours1,
      center2: inputs.groupConfig.center2,
      hours2: inputs.groupConfig.hours2,
    });
  }
  // Average personal + group ONLY when a supervisor actually has a group
  // config. Conditioning on `groupScore > 0` (the old behavior) wrongly handed
  // full personal pay to a supervisor whose group legitimately scored 0.
  const finalScore =
    isSupervisor && hasGroup
      ? (personal.totalScore + groupScore) / 2
      : personal.totalScore;

  const grade = getGrade(finalScore, config.gradeThresholds);
  const allowance = inputs.teachingAllowance ?? 0;

  const mgmtRequired = config.personalKpi.some(
    (m) => m.id === "management_assessment" && m.enabled,
  );
  const missing: string[] = [];
  if (!(allowance > 0)) missing.push("teaching allowance");
  if (mgmtRequired && inputs.mgmtAssessment == null) missing.push("management assessment");
  if (isSupervisor && !hasGroup) missing.push("group/center hours");

  return {
    students: agg.TotalStudent,
    personalScore: personal.totalScore,
    groupScore,
    finalScore,
    grade: grade.grade,
    gradeClass: grade.className,
    payout: finalScore * allowance,
    breakdown: personal.breakdown,
    isComplete: missing.length === 0,
    missing,
  };
}
