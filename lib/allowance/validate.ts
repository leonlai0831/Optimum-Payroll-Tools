import type { AllowanceInput } from "./types";

export type AllowanceWarningCode =
  | "leave_exceeds_op"
  | "no_op_hours"
  | "teaching_row_no_center"
  | "negative_input";

export interface AllowanceWarning {
  code: AllowanceWarningCode;
  message: string;
}

/**
 * Non-blocking sanity checks on a month's allowance input. These never stop a
 * save (a manager may legitimately have an unusual month); they surface likely
 * data-entry mistakes that the silent math would otherwise hide — e.g. leave
 * hours above operating hours yield a negative attendance % that just collapses
 * to "no attendance allowance" with no explanation.
 */
export function validateAllowanceInput(input: AllowanceInput): AllowanceWarning[] {
  const warnings: AllowanceWarning[] = [];

  if (input.opHours <= 0) {
    warnings.push({
      code: "no_op_hours",
      message: "Operating hours is 0 — attendance allowance will be RM0.",
    });
  } else if (input.leaveHours > input.opHours) {
    warnings.push({
      code: "leave_exceeds_op",
      message: "Leave hours exceed operating hours — attendance reads as negative.",
    });
  }

  const negative =
    input.opHours < 0 ||
    input.leaveHours < 0 ||
    input.teachingRows.some((r) => r.normalH < 0 || r.ysH < 0 || r.precompH < 0) ||
    input.otherItems.some((i) => i.amount < 0);
  if (negative) {
    warnings.push({ code: "negative_input", message: "A negative value was entered." });
  }

  const rowHasHours = (r: AllowanceInput["teachingRows"][number]) =>
    r.normalH > 0 || r.ysH > 0 || r.precompH > 0;
  if (input.teachingRows.some((r) => rowHasHours(r) && !r.center.trim())) {
    warnings.push({
      code: "teaching_row_no_center",
      message: "A teaching row has hours but no center selected.",
    });
  }

  return warnings;
}
