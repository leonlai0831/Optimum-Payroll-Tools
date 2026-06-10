import { describe, expect, it } from "vitest";
import { buildLessonPlanPdf, type LessonPlanPdfInput } from "./lesson-plan";
import { LEVEL_SKILLS, REPLACEMENT_SECTIONS, SELF_EVAL_GROUPS } from "@/lib/lesson-plan/templates";
import { emptyLessonPlanData } from "@/lib/lesson-plan/types";

const actual: LessonPlanPdfInput = {
  type: "actual",
  status: "approved",
  createdByName: "Coach One",
  instructorName: "COACH ONE",
  actualInstructorName: "",
  center: "HQ",
  lessonDate: new Date("2026-06-15T00:00:00Z"),
  timeLabel: "5.00pm – 5.45pm",
  levelType: null,
  classLevel: "2",
  ageGroup: "5–7 years",
  data: {
    ...emptyLessonPlanData(),
    priorKnowledge: "Can submerge and blow bubbles; 5m kick with board.",
    objectives: ["Kick 10m unaided", "Streamline push and glide", "Intro one-arm pull"],
    procedure: [
      {
        activity: "Warm up: bubbles + floats along the wall",
        time: "5 min",
        materials: "Kickboards",
        advancePreparation: "Lay out boards at the shallow end",
      },
      {
        activity: "Main set: kicking laps with board, then without",
        time: "25 min",
        materials: "Kickboards, noodles",
        advancePreparation: "",
      },
    ],
  },
};

const replacement: LessonPlanPdfInput = {
  type: "replacement",
  status: "submitted",
  createdByName: "Sub Coach",
  instructorName: "SUB COACH",
  actualInstructorName: "COACH ONE",
  center: "USJ",
  lessonDate: new Date("2026-06-20T00:00:00Z"),
  timeLabel: "6.00pm",
  levelType: "medium",
  classLevel: "3",
  ageGroup: "",
  data: {
    ...emptyLessonPlanData(),
    priorSkills: LEVEL_SKILLS.medium.priorKnowledge.slice(0, 4),
    objectives: ["Backstroke 15m with straight arms", "Breaststroke kick at the wall", ""],
    sections: REPLACEMENT_SECTIONS.map((s, i) => ({
      key: s.key,
      intro: i === 0 ? "Land stretches then easy laps" : `Section ${i} drill work`,
      skills: LEVEL_SKILLS.medium[s.skillSource].slice(0, 3),
      otherSkill: i === 1 ? "Sculling" : "",
      time: "8 min",
      materials: "Fins",
      advancedPreparation: i === 0 ? "Set lane ropes" : "",
    })),
    remarks: "Two students new to the lane — keep them on the wall side.",
    selfEval: Object.fromEntries(
      SELF_EVAL_GROUPS.flatMap((g) => g.questions.map((q, i) => [q.key, i % 2 ? "no" : "yes"])),
    ),
  },
};

/** PDF files start with the "%PDF-" magic number. */
const magic = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5));

describe("buildLessonPlanPdf", () => {
  it("produces a non-trivial PDF for an actual-class plan", async () => {
    const bytes = await buildLessonPlanPdf(actual);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(800);
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("produces a PDF for a fully-filled replacement plan (all sections + self-eval)", async () => {
    const bytes = await buildLessonPlanPdf(replacement);
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("renders an empty-bodied plan without throwing", async () => {
    const bytes = await buildLessonPlanPdf({
      ...replacement,
      status: "draft",
      data: emptyLessonPlanData(),
    });
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("sanitizes non-Latin-1 text (names/skills/remarks) instead of throwing", async () => {
    const bytes = await buildLessonPlanPdf({
      ...replacement,
      instructorName: "José “Coby” 李小龙 Ñoño",
      data: {
        ...replacement.data,
        remarks: "备注 — watch the “new” kids…",
        priorSkills: ["Underwater – Drill"],
      },
    });
    expect(magic(bytes)).toBe("%PDF-");
  });
});
