// Instructor Assessment & Observation Form — domain types.
//
// A fixed, weighted observation form (ported from the owner's Google Sheet):
// two parts, each a set of 10%-weighted sub-categories, each with a few
// criteria scored on a 4-point scale. The final percentage (0–100) feeds the
// KPI "management assessment". Replaces the old free-form appraisal.

/** 4-point observation scale; each criterion is rated in exactly one column. */
export const RATINGS = ["all", "most", "part", "none"] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABELS: Record<Rating, string> = {
  all: "All the time",
  most: "Most of the time",
  part: "Part of the time",
  none: "Not at all",
};

/**
 * Fraction of a criterion earned at each rating. Derived from the sheet:
 * All=100%, Most=2/3, Part=1/3, Not at all=0. A criterion left unrated counts
 * as 0 (it stays in the sub-category's denominator), matching the sheet.
 */
export const RATING_VALUE: Record<Rating, number> = {
  all: 1,
  most: 2 / 3,
  part: 1 / 3,
  none: 0,
};

export interface Criterion {
  key: string;
  label: string;
}

/** A weighted sub-category (e.g. "Verbal", worth 10% of the whole form). */
export interface SubCategory {
  key: string;
  label: string;
  /** Weight in percentage points of the 100% total (each is 10 here). */
  weight: number;
  criteria: Criterion[];
}

export interface AssessmentPart {
  key: string;
  label: string;
  subCategories: SubCategory[];
}

/**
 * The form definition. 10 sub-categories × 10% = 100%. Edit here to change the
 * form; the scoring engine and UI are driven entirely by this structure.
 */
export const ASSESSMENT_FORM: AssessmentPart[] = [
  {
    key: "part1",
    label: "Part 1 — Attitude & Skills",
    subCategories: [
      {
        key: "verbal",
        label: "Verbal",
        weight: 10,
        criteria: [
          { key: "verbal_1", label: "Uses positive and encouraging language." },
          { key: "verbal_2", label: "Gives clear, age-appropriate instructions/demos." },
          { key: "verbal_3", label: "Provides timely feedback and praise." },
          { key: "verbal_4", label: "Speaks with confidence and enthusiasm." },
        ],
      },
      {
        key: "non_verbal",
        label: "Non-Verbal",
        weight: 10,
        criteria: [
          { key: "nonverbal_1", label: "Professional posture, role-model behavior." },
          { key: "nonverbal_2", label: "Facial expression or gestures support learning." },
          { key: "nonverbal_3", label: "Body language shows patience and approachability." },
          { key: "nonverbal_4", label: "Creates a safe, inclusive, and fun climate in class." },
        ],
      },
      {
        key: "communication",
        label: "Communication Skills",
        weight: 10,
        criteria: [
          { key: "comm_1", label: "Effectively communicates with parents or team members." },
          { key: "comm_2", label: "Students actively responds or ask questions." },
          { key: "comm_3", label: "Engages visual, auditory, kinesthetic cues." },
          { key: "comm_4", label: "Speaks clearly and uses age-appropriate language and tone." },
        ],
      },
      {
        key: "lesson_planning",
        label: "Lesson Planning Skills",
        weight: 10,
        criteria: [
          { key: "plan_1", label: "Lesson Plan Writing Format" },
          { key: "plan_2", label: "Activity directly matches stated objective." },
          { key: "plan_3", label: "Objective suits class level and ability." },
          { key: "plan_4", label: "Smooth transitions or good time management." },
        ],
      },
      {
        key: "instructional",
        label: "Instructional Skills",
        weight: 10,
        criteria: [
          { key: "instr_1", label: "Creative and purposeful use of teaching aids." },
          { key: "instr_2", label: "Demonstrates technique clearly." },
          { key: "instr_3", label: "Maintains effective standing formation." },
          { key: "instr_4", label: "Consistently enforces safety rules." },
        ],
      },
    ],
  },
  {
    key: "part2",
    label: "Part 2 — Knowledge",
    subCategories: [
      {
        key: "progression",
        label: "Progression and Readiness",
        weight: 10,
        criteria: [
          {
            key: "prog_1",
            label:
              "Accurately demonstrates understanding of each level's requirements and provides targeted solutions to guide student progression.",
          },
          {
            key: "prog_2",
            label: "Accurately assesses student's readiness to progress of current level skills.",
          },
        ],
      },
      {
        key: "level_specific",
        label: "Level Specific Techniques",
        weight: 10,
        criteria: [
          { key: "lvl_1", label: "Applies Check and Correct model effectively at each level accurately." },
          { key: "lvl_2", label: "Hands-on demonstrates and teaches the appropriate techniques accurately." },
          { key: "lvl_3", label: "Correct techniques accurately." },
        ],
      },
      {
        key: "drill_complexity",
        label: "Drill Complexity and Appropriateness",
        weight: 10,
        criteria: [
          { key: "drill_1", label: "Chooses drills appropriate for the level taught (neither too simple nor too advanced)." },
          { key: "drill_2", label: "Adjusts the complexity of drills according to the class level." },
        ],
      },
      {
        key: "adaptability",
        label: "Instructional Adaptability",
        weight: 10,
        criteria: [
          { key: "adapt_1", label: "Modifies teaching methods and drills to suit the developmental stage of each class level." },
          { key: "adapt_2", label: "Provides level-specific feedback and correction." },
        ],
      },
      {
        key: "competency",
        label: "Competency Evaluation",
        weight: 10,
        criteria: [
          { key: "comp_1", label: "Uses level-appropriate criteria to evaluate competency in skills and drills." },
        ],
      },
    ],
  },
];

/** Grade bands by percentage (descending). The lowest band has min 0. */
export const GRADE_BANDS = [
  { key: "optimum", label: "Optimum", min: 85 },
  { key: "proficient", label: "Proficient", min: 70 },
  { key: "developing", label: "Developing", min: 55 },
  { key: "underperforming", label: "Underperforming", min: 40 },
  { key: "poor", label: "Poor", min: 0 },
] as const;

export type GradeKey = (typeof GRADE_BANDS)[number]["key"];

export const GRADE_LABEL = Object.fromEntries(
  GRADE_BANDS.map((b) => [b.key, b.label]),
) as Record<GradeKey, string>;

/** Free-text header captured per observation. */
export interface AssessmentMeta {
  classType: string;
  poolType: string;
  pax: number | null;
  assessor: string;
  /** YYYY-MM-DD of the observation. */
  observedOn: string;
}

/** A criterion's recorded rating (absent = not rated = 0). */
export type RatingMap = Record<string, Rating>;
