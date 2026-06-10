/** Lesson Plan domain types (digital replacement for the two paper templates). */

export const LESSON_PLAN_TYPES = ["actual", "replacement"] as const;
export type LessonPlanType = (typeof LESSON_PLAN_TYPES)[number];

export const LESSON_PLAN_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "changes_requested",
] as const;
export type LessonPlanStatus = (typeof LESSON_PLAN_STATUSES)[number];

/** Replacement plans are level-dependent: the skill checklists swap per type. */
export const LEVEL_TYPES = ["low", "medium", "high"] as const;
export type LevelType = (typeof LEVEL_TYPES)[number];

/** One repeatable procedure row on an ACTUAL-class plan. */
export interface ProcedureRow {
  activity: string;
  time: string;
  materials: string;
  advancePreparation: string;
}

/** Fixed procedure sections on a REPLACEMENT-class plan. */
export const REPLACEMENT_SECTION_KEYS = [
  "warm_up",
  "activity_1",
  "activity_2",
  "activity_3",
  "activity_4",
  "wrap_up",
] as const;
export type ReplacementSectionKey = (typeof REPLACEMENT_SECTION_KEYS)[number];

/** One fixed section (Warm Up / Activity 1–4 / Wrap Up) on a replacement plan. */
export interface ReplacementSection {
  key: ReplacementSectionKey;
  intro: string;
  /** Ticked skills from the level-type's checklist (see templates.ts). */
  skills: string[];
  otherSkill: string;
  time: string;
  materials: string;
  advancedPreparation: string;
}

/** A yes/no self-evaluation answer; "" = unanswered. */
export type SelfEvalAnswer = "yes" | "no" | "";

/**
 * The full form body stored in the `lesson_plans.data` jsonb column. One shape
 * serves both plan types: actual plans use `priorKnowledge` + `procedure`,
 * replacement plans use `priorSkills` + `sections`. `remarks` + `selfEval` are
 * POST-LESSON fields on replacement plans — filled after the class via the
 * self_eval action (stamped by `lesson_plans.self_eval_at`), never via the
 * pre-class form.
 */
export interface LessonPlanData {
  /** Students' prior knowledge — free text (actual plans). */
  priorKnowledge: string;
  /** Students' prior knowledge — ticked skills per level type (replacement plans). */
  priorSkills: string[];
  /** Lesson objectives 1–3 / (a)(b)(c). */
  objectives: string[];
  /** Repeatable procedure rows (actual plans). */
  procedure: ProcedureRow[];
  /** Fixed procedure sections (replacement plans). */
  sections: ReplacementSection[];
  /** Post-lesson remarks (replacement plans; filled after the class). */
  remarks: string;
  /** Post-lesson self-evaluation, keyed by question key (replacement plans). */
  selfEval: Record<string, SelfEvalAnswer>;
}

/** An empty form body with every field present (jsonb shape is always complete). */
export function emptyLessonPlanData(): LessonPlanData {
  return {
    priorKnowledge: "",
    priorSkills: [],
    objectives: ["", "", ""],
    procedure: [],
    sections: [],
    remarks: "",
    selfEval: {},
  };
}
