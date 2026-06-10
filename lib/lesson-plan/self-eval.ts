/**
 * The post-lesson self-evaluation rule, shared by the API route and the detail
 * page: it may be filled (or re-filled) once the class has plausibly been
 * taught — the plan is approved, OR its lesson date is already in the past.
 */
export function canFillSelfEval(plan: { status: string; lessonDate: Date }): boolean {
  return plan.status === "approved" || plan.lessonDate.getTime() < Date.now();
}
