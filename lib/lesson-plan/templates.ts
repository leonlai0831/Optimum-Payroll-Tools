import type { LevelType, ReplacementSectionKey } from "./types";

/**
 * Hardcoded content of the two paper lesson-plan templates. The skill lists are
 * copied VERBATIM from the printed replacement-class forms (including their
 * inconsistent hyphenation, e.g. "Dive-in" vs "Dive-In" vs "Dive in") — do not
 * "fix" or invent entries, or saved plans stop matching the paper originals.
 */

export const LEVEL_TYPE_LABELS: Record<LevelType, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Class levels selectable per level type (Low = N/B/1, Medium = 2/3/4, High = 4/5/6/7). */
export const CLASS_LEVELS: Record<LevelType, string[]> = {
  low: ["N", "B", "1"],
  medium: ["2", "3", "4"],
  high: ["4", "5", "6", "7"],
};

/** The three per-level-type skill checklists used across a replacement plan. */
export interface LevelSkills {
  /** Student prior-knowledge checkboxes. */
  priorKnowledge: string[];
  /** Warm Up section checkboxes. */
  warmUp: string[];
  /** Activity 1–4 + Wrap Up section checkboxes. */
  activity: string[];
}

export const LEVEL_SKILLS: Record<LevelType, LevelSkills> = {
  low: {
    priorKnowledge: [
      "Bubble",
      "Floatation",
      "Push and Glide",
      "Kicking",
      "Understand Fins",
      "Side-Kicking (fins)",
      "Side-Kicking",
      "Bubble Arm pull (fins)",
      "Arm pull",
      "Frontcrawl (fins)",
      "Frontcrawl",
      "Big Pool",
      "Surviving Skills",
      "Underwater",
    ],
    warmUp: [
      "Physical Exercise",
      "Bubble",
      "Floatation",
      "Submersion",
      "Push and Glide",
      "Kicking",
      "Understand Fins",
      "Underwater",
    ],
    activity: [
      "Bubble",
      "Floatation",
      "Kicking",
      "Push and Glide",
      "Introduce Fins",
      "Side-Kicking",
      "One-hand Arm pull",
      "Arm pull",
      "Frontcrawl",
      "Big Pool",
      "Surviving Skills",
    ],
  },
  medium: {
    priorKnowledge: [
      "Frontcrawl",
      "Back Kick (fins)",
      "Backstroke",
      "Breaststroke Kick",
      "Breaststroke",
      "Dolphin Kick",
      "Butterfly (fins)",
      "Butterfly",
      "Water Treading",
    ],
    warmUp: [
      "Physical Exercise",
      "Push and Glide",
      "Armpull",
      "Frontcrawl",
      "Back Kick",
      "Backstroke",
      "Breaststroke Kick",
      "Breaststroke",
      "Introduce Fins",
      "Dive-in",
      "Squat-Dive",
    ],
    activity: [
      "Frontcrawl",
      "Back Kick",
      "Backstroke",
      "Breaststroke Kick",
      "Breaststroke",
      "Dive-in",
      "Dolphin-Kick",
      "Squat-Dive",
    ],
  },
  high: {
    priorKnowledge: [
      "Frontcrawl 50M",
      "Backstroke 50M",
      "Breaststroke 50M",
      "Butterfly 50M",
      "Tumble-Turn",
      "Underwater – Drill",
      "IM",
      "Water Treading",
      "Dive in",
    ],
    warmUp: [
      "Physical Exercise",
      "Frontcrawl",
      "Back Kick",
      "Backstroke",
      "Breaststroke Kick",
      "Breaststroke",
      "Underwater-Drill",
      "Dolphin Kick",
      "Butterfly",
      "Dive-In",
    ],
    activity: [
      "Frontcrawl",
      "Back Kick",
      "Backstroke",
      "Breaststroke Kick",
      "Breaststroke",
      "Dolphin Kick",
      "Butterfly",
      "Dive-In",
      "Water Treading",
      "IM",
      "Tumble-Turn",
      "Underwater-Drill",
    ],
  },
};

/** The fixed procedure sections of a replacement plan, in form order. */
export const REPLACEMENT_SECTIONS: {
  key: ReplacementSectionKey;
  label: string;
  /** Which skill checklist this section offers. */
  skillSource: keyof Pick<LevelSkills, "warmUp" | "activity">;
}[] = [
  { key: "warm_up", label: "Warm Up", skillSource: "warmUp" },
  { key: "activity_1", label: "Activity 1", skillSource: "activity" },
  { key: "activity_2", label: "Activity 2", skillSource: "activity" },
  { key: "activity_3", label: "Activity 3", skillSource: "activity" },
  { key: "activity_4", label: "Activity 4", skillSource: "activity" },
  { key: "wrap_up", label: "Wrap Up (Review objectives)", skillSource: "activity" },
];

/** Helper shown under the replacement-plan objectives, copied from the paper form. */
export const OBJECTIVE_HELPER =
  "key skill + supporting aid + measuring progress + pool type";

/** The 16 yes/no self-evaluation questions, in their three paper-form groups. */
export const SELF_EVAL_GROUPS: {
  key: string;
  title: string;
  questions: { key: string; label: string }[];
}[] = [
  {
    key: "lesson",
    title: "Lesson Evaluation",
    questions: [
      {
        key: "lesson_suitable",
        label:
          "Were the activities suitable for the ability and developmental needs of the class?",
      },
      { key: "lesson_benefit", label: "Did each student benefit from the activities?" },
      { key: "lesson_time", label: "Did the time allow for what had been planned?" },
      { key: "lesson_active", label: "Were the student active throughout the lesson?" },
      {
        key: "lesson_equipment",
        label: "Was the equipment readily available and easily accessible?",
      },
      { key: "lesson_objectives", label: "Were the objectives achieved?" },
    ],
  },
  {
    key: "student",
    title: "Student Evaluation",
    questions: [
      {
        key: "student_interest",
        label: "Did the student appear interest in what they were doing?",
      },
      {
        key: "student_fun",
        label: "Are they enjoying what they are doing and having fun?",
      },
      {
        key: "student_understand",
        label: "Did they understand everything that was asked of them?",
      },
      { key: "student_progress", label: "Are they ready to progress to the next skills?" },
    ],
  },
  {
    key: "teaching",
    title: "Teaching Performance",
    questions: [
      { key: "teaching_talk", label: "Talk too long?" },
      { key: "teaching_words", label: "Use words that students did not understand?" },
      { key: "teaching_impatient", label: "Become impatient?" },
      { key: "teaching_voice", label: "Voice control" },
      { key: "teaching_demo", label: "Ability to demonstrate" },
      { key: "teaching_confidence", label: "Inspire student confidence" },
    ],
  },
];
