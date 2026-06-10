import type { LessonPlanContent } from "@/lib/db/queries";
import {
  LEVEL_TYPES,
  type LessonPlanData,
  type LessonPlanType,
  type LevelType,
  type ProcedureRow,
  type ReplacementSection,
  type SelfEvalAnswer,
} from "./types";
import { LEVEL_SKILLS, REPLACEMENT_SECTIONS, SELF_EVAL_GROUPS } from "./templates";

/** Untrusted request body for a create / content-edit call. */
export interface LessonPlanContentBody {
  instructorName?: unknown;
  actualInstructorName?: unknown;
  center?: unknown;
  lessonDate?: unknown;
  timeLabel?: unknown;
  levelType?: unknown;
  classLevel?: unknown;
  ageGroup?: unknown;
  data?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Trim a string list and drop blanks/non-strings, preserving order. */
function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter(Boolean);
}

/** Keep only entries that exist in the level type's checklist (canonical order). */
function knownSkills(picked: string[], checklist: readonly string[]): string[] {
  const set = new Set(picked);
  return checklist.filter((s) => set.has(s));
}

function parseProcedure(v: unknown): ProcedureRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      activity: str(r.activity),
      time: str(r.time),
      materials: str(r.materials),
      advancePreparation: str(r.advancePreparation),
    }))
    .filter((r) => r.activity || r.time || r.materials || r.advancePreparation);
}

/** The fixed sections, in canonical order, with skills filtered to the level type. */
function parseSections(v: unknown, levelType: LevelType): ReplacementSection[] {
  const byKey = new Map<string, Record<string, unknown>>();
  if (Array.isArray(v)) {
    for (const s of v) {
      if (typeof s === "object" && s !== null && typeof (s as { key?: unknown }).key === "string") {
        byKey.set((s as { key: string }).key, s as Record<string, unknown>);
      }
    }
  }
  const skills = LEVEL_SKILLS[levelType];
  return REPLACEMENT_SECTIONS.map(({ key, skillSource }) => {
    const s = byKey.get(key) ?? {};
    return {
      key,
      intro: str(s.intro),
      skills: knownSkills(strList(s.skills), skills[skillSource]),
      otherSkill: str(s.otherSkill),
      time: str(s.time),
      materials: str(s.materials),
      advancedPreparation: str(s.advancedPreparation),
    };
  });
}

/** Keep only known question keys with a definite yes/no answer. */
function parseSelfEval(v: unknown): Record<string, SelfEvalAnswer> {
  const out: Record<string, SelfEvalAnswer> = {};
  if (typeof v !== "object" || v === null) return out;
  const answers = v as Record<string, unknown>;
  for (const group of SELF_EVAL_GROUPS) {
    for (const q of group.questions) {
      const a = answers[q.key];
      if (a === "yes" || a === "no") out[q.key] = a;
    }
  }
  return out;
}

/**
 * Validate + sanitize an untrusted create/edit body into a clean
 * {@link LessonPlanContent} for the given plan type. Unknown skills, section
 * keys, and self-eval questions are dropped (never invented); strings are
 * trimmed. Returns a user-facing `error` string when the body is unusable.
 */
export function parseLessonPlanContent(
  type: LessonPlanType,
  body: LessonPlanContentBody,
): { content: LessonPlanContent } | { error: string } {
  const instructorName = str(body.instructorName);
  if (!instructorName) {
    return {
      error: type === "replacement" ? "Replacement instructor is required" : "Instructor is required",
    };
  }

  const lessonDate = new Date(str(body.lessonDate));
  if (Number.isNaN(lessonDate.getTime())) return { error: "A valid lesson date is required" };

  let levelType: LevelType | null = null;
  if (type === "replacement") {
    const lt = str(body.levelType);
    if (!(LEVEL_TYPES as readonly string[]).includes(lt)) {
      return { error: "Level type (low / medium / high) is required" };
    }
    levelType = lt as LevelType;
  }

  const raw = (typeof body.data === "object" && body.data !== null ? body.data : {}) as Record<
    string,
    unknown
  >;
  const objectives = [0, 1, 2].map((i) =>
    Array.isArray(raw.objectives) ? str(raw.objectives[i]) : "",
  );
  const data: LessonPlanData =
    type === "actual"
      ? {
          priorKnowledge: str(raw.priorKnowledge),
          priorSkills: [],
          objectives,
          procedure: parseProcedure(raw.procedure),
          sections: [],
          remarks: "",
          selfEval: {},
        }
      : {
          priorKnowledge: "",
          priorSkills: knownSkills(strList(raw.priorSkills), LEVEL_SKILLS[levelType!].priorKnowledge),
          objectives,
          procedure: [],
          sections: parseSections(raw.sections, levelType!),
          remarks: str(raw.remarks),
          selfEval: parseSelfEval(raw.selfEval),
        };

  return {
    content: {
      instructorName,
      actualInstructorName: type === "replacement" ? str(body.actualInstructorName) : "",
      center: str(body.center),
      lessonDate,
      timeLabel: str(body.timeLabel),
      levelType,
      classLevel: str(body.classLevel),
      ageGroup: type === "actual" ? str(body.ageGroup) : "",
      data,
    },
  };
}
