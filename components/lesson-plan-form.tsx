"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList, Plus, Repeat2, Save, Trash2 } from "lucide-react";
import { Button, Card, Input, Label, Spinner, Textarea } from "@/components/ui";
import { CenterSelect } from "@/components/center-select";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import {
  LEVEL_TYPES,
  type LessonPlanData,
  type LessonPlanType,
  type LevelType,
  type ProcedureRow,
  type ReplacementSectionKey,
} from "@/lib/lesson-plan/types";
import {
  CLASS_LEVELS,
  LEVEL_SKILLS,
  LEVEL_TYPE_LABELS,
  OBJECTIVE_HELPER,
  REPLACEMENT_SECTIONS,
} from "@/lib/lesson-plan/templates";

/** Prefill for editing an existing plan (dates already formatted yyyy-mm-dd). */
export interface LessonPlanFormInitial {
  id: number;
  type: LessonPlanType;
  instructorName: string;
  actualInstructorName: string;
  center: string;
  lessonDate: string;
  timeLabel: string;
  levelType: LevelType | null;
  classLevel: string;
  ageGroup: string;
  data: LessonPlanData;
}

type SectionState = Record<
  ReplacementSectionKey,
  { intro: string; skills: string[]; otherSkill: string; time: string; materials: string; advancedPreparation: string }
>;

const emptyRow = (): ProcedureRow => ({
  activity: "",
  time: "",
  materials: "",
  advancePreparation: "",
});

function emptySections(): SectionState {
  const out = {} as SectionState;
  for (const s of REPLACEMENT_SECTIONS) {
    out[s.key] = {
      intro: "",
      skills: [],
      otherSkill: "",
      time: "",
      materials: "",
      advancedPreparation: "",
    };
  }
  return out;
}

function sectionsFromData(data: LessonPlanData): SectionState {
  const out = emptySections();
  for (const s of data.sections) {
    if (s.key in out) {
      out[s.key] = {
        intro: s.intro,
        skills: s.skills,
        otherSkill: s.otherSkill,
        time: s.time,
        materials: s.materials,
        advancedPreparation: s.advancedPreparation,
      };
    }
  }
  return out;
}

const LEVEL_TYPE_HINT: Record<LevelType, string> = {
  low: "Class levels N · B · 1",
  medium: "Class levels 2 · 3 · 4",
  high: "Class levels 4 · 5 · 6 · 7",
};

/**
 * The lesson-plan form for both paper templates. Without `initial` it opens on
 * a type chooser (Actual / Replacement) and creates a new draft; with `initial`
 * it edits an existing plan (any content edit resets its status to draft).
 * On a replacement plan, picking the Level Type swaps every skill checklist
 * live — ticks that don't exist in the new level's lists are dropped.
 */
export function LessonPlanForm({
  instructorName,
  centers,
  initial,
}: {
  /** The signed-in user's name — instructor is server-derived, not typed. */
  instructorName: string;
  centers: string[];
  initial?: LessonPlanFormInitial;
}) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<LessonPlanType | null>(initial?.type ?? null);
  const [busy, setBusy] = useState(false);

  // Shared meta
  const [actualInstructorName, setActualInstructorName] = useState(
    initial?.actualInstructorName ?? "",
  );
  const [center, setCenter] = useState(initial?.center ?? "");
  const [lessonDate, setLessonDate] = useState(
    initial?.lessonDate ?? new Date().toISOString().slice(0, 10),
  );
  const [timeLabel, setTimeLabel] = useState(initial?.timeLabel ?? "");
  const [classLevel, setClassLevel] = useState(initial?.classLevel ?? "");
  const [ageGroup, setAgeGroup] = useState(initial?.ageGroup ?? "");
  const [objectives, setObjectives] = useState<string[]>(() => [
    initial?.data.objectives[0] ?? "",
    initial?.data.objectives[1] ?? "",
    initial?.data.objectives[2] ?? "",
  ]);

  // Actual class
  const [priorKnowledge, setPriorKnowledge] = useState(initial?.data.priorKnowledge ?? "");
  const [procedure, setProcedure] = useState<ProcedureRow[]>(() =>
    initial && initial.data.procedure.length > 0 ? initial.data.procedure : [emptyRow()],
  );

  // Replacement class
  const [levelType, setLevelType] = useState<LevelType>(initial?.levelType ?? "low");
  const [priorSkills, setPriorSkills] = useState<string[]>(initial?.data.priorSkills ?? []);
  const [sections, setSections] = useState<SectionState>(() =>
    initial ? sectionsFromData(initial.data) : emptySections(),
  );
  // Remarks + the self-evaluation are POST-LESSON fields: they're filled from
  // the plan page after the class, never in this pre-class form.

  /** Swap every checklist to the new level type; drop ticks the new lists lack. */
  function changeLevelType(next: LevelType) {
    if (next === levelType) return;
    const skills = LEVEL_SKILLS[next];
    setLevelType(next);
    setPriorSkills((prev) => prev.filter((s) => skills.priorKnowledge.includes(s)));
    setSections((prev) => {
      const out = { ...prev };
      for (const def of REPLACEMENT_SECTIONS) {
        const list = skills[def.skillSource];
        out[def.key] = { ...out[def.key], skills: out[def.key].skills.filter((s) => list.includes(s)) };
      }
      return out;
    });
    if (!CLASS_LEVELS[next].includes(classLevel)) setClassLevel("");
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function updateSection(
    key: ReplacementSectionKey,
    patch: Partial<SectionState[ReplacementSectionKey]>,
  ) {
    setSections((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function updateRow(i: number, patch: Partial<ProcedureRow>) {
    setProcedure((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!type) return;
    if (!lessonDate) {
      toast.error("Pick the lesson date.");
      return;
    }
    setBusy(true);
    try {
      const data: Partial<LessonPlanData> =
        type === "actual"
          ? { priorKnowledge, objectives, procedure }
          : { priorSkills, objectives, sections: REPLACEMENT_SECTIONS.map((s) => ({ key: s.key, ...sections[s.key] })) };
      const payload = {
        type,
        actualInstructorName,
        center,
        lessonDate,
        timeLabel,
        levelType: type === "replacement" ? levelType : null,
        classLevel,
        ageGroup,
        data,
      };
      const res = await fetch(initial ? `/api/lesson-plans/${initial.id}` : "/api/lesson-plans", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string; id?: number };
      if (!res.ok) throw new Error(out.error || "Save failed");
      toast.success(initial ? "Plan saved — back to draft." : "Lesson plan saved as a draft.");
      router.push(`/lesson-plans/${initial ? initial.id : out.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Type chooser (new plans only) ───────────────────────────────────────────
  if (!type) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <TypeCard
          icon={ClipboardList}
          title="Actual class"
          body="Plan your own upcoming class: objectives, prior knowledge, and a free-form procedure."
          onClick={() => setType("actual")}
        />
        <TypeCard
          icon={Repeat2}
          title="Replacement class"
          body="Cover another instructor's class: level-based skill checklists and fixed procedure sections. The self-evaluation is filled in after the class."
          onClick={() => setType("replacement")}
        />
      </div>
    );
  }

  const skills = LEVEL_SKILLS[levelType];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-h3 text-gray-900">
            {type === "actual" ? (
              <ClipboardList className="h-4 w-4 text-indigo-500" />
            ) : (
              <Repeat2 className="h-4 w-4 text-indigo-500" />
            )}
            {type === "actual" ? "Actual class lesson plan" : "Replacement class lesson plan"}
          </h3>
          {!initial && (
            <button
              type="button"
              onClick={() => setType(null)}
              className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4" /> Change type
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {type === "replacement" && (
            <div>
              <Label htmlFor="lp-actual">Actual class instructor</Label>
              <Input
                id="lp-actual"
                className="mt-1"
                value={actualInstructorName}
                onChange={(e) => setActualInstructorName(e.target.value)}
                placeholder="Instructor being covered"
              />
            </div>
          )}
          <div>
            <Label>{type === "replacement" ? "Replacement instructor" : "Instructor"}</Label>
            {/* Always the signed-in user — recorded server-side, not typed. */}
            <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-base text-gray-700 sm:text-sm">
              {instructorName}
            </p>
          </div>
          <div>
            <Label htmlFor="lp-center">Branch</Label>
            <CenterSelect
              id="lp-center"
              className="mt-1"
              value={center}
              onChange={setCenter}
              centers={centers}
              placeholder="Select branch…"
            />
          </div>
          <div>
            <Label htmlFor="lp-date">Date</Label>
            <Input
              id="lp-date"
              type="date"
              className="mt-1"
              value={lessonDate}
              onChange={(e) => setLessonDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="lp-time">Time</Label>
            <Input
              id="lp-time"
              className="mt-1"
              value={timeLabel}
              onChange={(e) => setTimeLabel(e.target.value)}
              placeholder="e.g. 5.00pm – 5.45pm"
            />
          </div>
          {type === "actual" ? (
            <>
              <div>
                <Label htmlFor="lp-level">Class level</Label>
                <Input
                  id="lp-level"
                  className="mt-1"
                  value={classLevel}
                  onChange={(e) => setClassLevel(e.target.value)}
                  placeholder="e.g. Level 2"
                />
              </div>
              <div>
                <Label htmlFor="lp-age">Age group</Label>
                <Input
                  id="lp-age"
                  className="mt-1"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  placeholder="e.g. 5–7 years"
                />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Level type</Label>
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                {LEVEL_TYPES.map((lt) => (
                  <button
                    key={lt}
                    type="button"
                    role="radio"
                    aria-checked={levelType === lt}
                    onClick={() => changeLevelType(lt)}
                    className={cn(
                      "min-h-11 rounded-lg border px-3 py-2 text-left transition",
                      levelType === lt
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-gray-200 bg-white text-gray-700 active:bg-gray-100",
                    )}
                  >
                    <span className="block text-sm font-semibold">{LEVEL_TYPE_LABELS[lt]}</span>
                    <span
                      className={cn(
                        "block text-xs",
                        levelType === lt ? "text-indigo-100" : "text-gray-400",
                      )}
                    >
                      {LEVEL_TYPE_HINT[lt]}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <Label>Class level</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {CLASS_LEVELS[levelType].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      role="radio"
                      aria-checked={classLevel === lvl}
                      onClick={() => setClassLevel(lvl)}
                      className={cn(
                        "min-h-11 min-w-14 rounded-lg border px-4 text-sm font-semibold transition",
                        classLevel === lvl
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-gray-200 bg-white text-gray-700 active:bg-gray-100",
                      )}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Prior knowledge */}
        <div className="mt-5">
          <h4 className="border-b border-gray-200 pb-1 text-sm font-bold text-gray-900">
            {type === "actual" ? "Students' prior knowledge" : "Student prior knowledge"}
          </h4>
          {type === "actual" ? (
            <Textarea
              className="mt-2"
              rows={3}
              value={priorKnowledge}
              onChange={(e) => setPriorKnowledge(e.target.value)}
              placeholder="What can the students already do?"
            />
          ) : (
            <SkillChecklist
              skills={skills.priorKnowledge}
              picked={priorSkills}
              onToggle={(s) => setPriorSkills((prev) => toggle(prev, s))}
            />
          )}
        </div>

        {/* Objectives */}
        <div className="mt-5">
          <h4 className="border-b border-gray-200 pb-1 text-sm font-bold text-gray-900">
            Lesson objectives
          </h4>
          {type === "replacement" && (
            <p className="mt-1 text-xs text-gray-400">{OBJECTIVE_HELPER}</p>
          )}
          <div className="mt-2 space-y-2">
            {objectives.map((obj, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm font-semibold text-gray-400">
                  {type === "actual" ? `${i + 1}.` : `(${"abc"[i]})`}
                </span>
                <Input
                  value={obj}
                  onChange={(e) =>
                    setObjectives((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
                  }
                  aria-label={`Objective ${i + 1}`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Procedure */}
        <div className="mt-5">
          <h4 className="border-b border-gray-200 pb-1 text-sm font-bold text-gray-900">Procedure</h4>
          {type === "actual" ? (
            <div className="mt-2 space-y-3">
              {procedure.map((row, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Step {i + 1}
                    </span>
                    {procedure.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setProcedure((prev) => prev.filter((_, j) => j !== i))}
                        className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    )}
                  </div>
                  <Textarea
                    rows={2}
                    value={row.activity}
                    onChange={(e) => updateRow(i, { activity: e.target.value })}
                    placeholder="Activity"
                    aria-label={`Step ${i + 1} activity`}
                  />
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Input
                      value={row.time}
                      onChange={(e) => updateRow(i, { time: e.target.value })}
                      placeholder="Time"
                      aria-label={`Step ${i + 1} time`}
                    />
                    <Input
                      value={row.materials}
                      onChange={(e) => updateRow(i, { materials: e.target.value })}
                      placeholder="Materials"
                      aria-label={`Step ${i + 1} materials`}
                    />
                    <Input
                      value={row.advancePreparation}
                      onChange={(e) => updateRow(i, { advancePreparation: e.target.value })}
                      placeholder="Advance preparation"
                      aria-label={`Step ${i + 1} advance preparation`}
                    />
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setProcedure((prev) => [...prev, emptyRow()])}>
                <Plus className="h-4 w-4" /> Add step
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              {REPLACEMENT_SECTIONS.map((def) => {
                const s = sections[def.key];
                return (
                  <div key={def.key} className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      {def.label}
                    </div>
                    <Textarea
                      className="mt-2"
                      rows={2}
                      value={s.intro}
                      onChange={(e) => updateSection(def.key, { intro: e.target.value })}
                      placeholder="What happens in this part of the lesson?"
                      aria-label={`${def.label} intro`}
                    />
                    <SkillChecklist
                      skills={skills[def.skillSource]}
                      picked={s.skills}
                      onToggle={(sk) => updateSection(def.key, { skills: toggle(s.skills, sk) })}
                    />
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <Input
                        value={s.otherSkill}
                        onChange={(e) => updateSection(def.key, { otherSkill: e.target.value })}
                        placeholder="Other skill"
                        aria-label={`${def.label} other skill`}
                      />
                      <Input
                        value={s.time}
                        onChange={(e) => updateSection(def.key, { time: e.target.value })}
                        placeholder="Time"
                        aria-label={`${def.label} time`}
                      />
                      <Input
                        value={s.materials}
                        onChange={(e) => updateSection(def.key, { materials: e.target.value })}
                        placeholder="Materials"
                        aria-label={`${def.label} materials`}
                      />
                      <Input
                        value={s.advancedPreparation}
                        onChange={(e) =>
                          updateSection(def.key, { advancedPreparation: e.target.value })
                        }
                        placeholder="Advanced preparation"
                        aria-label={`${def.label} advanced preparation`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner /> : <Save className="h-4 w-4" />}
            {initial ? "Save changes" : "Save draft"}
          </Button>
          <span className="text-xs text-gray-400">
            {initial
              ? "Saving an edit returns the plan to draft for re-submission."
              : "You can review and submit it from the plan page."}
          </span>
        </div>
      </Card>
    </div>
  );
}

/** Tappable checkbox grid (≥44px rows) for one of the level-type skill lists. */
function SkillChecklist({
  skills,
  picked,
  onToggle,
}: {
  skills: string[];
  picked: string[];
  onToggle: (skill: string) => void;
}) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {skills.map((s) => {
        const on = picked.includes(s);
        return (
          <label
            key={s}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
              on ? "border-indigo-300 bg-indigo-50" : "border-gray-200 active:bg-gray-50",
            )}
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-indigo-600"
              checked={on}
              onChange={() => onToggle(s)}
            />
            <span className="font-medium text-gray-800">{s}</span>
          </label>
        );
      })}
    </div>
  );
}

function TypeCard({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: typeof ClipboardList;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className="group h-full p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-brand hover:shadow-md">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand transition-colors group-hover:bg-brand group-hover:text-white">
          <Icon className="h-6 w-6" />
        </div>
        <div className="mt-3 text-base font-bold text-gray-900">{title}</div>
        <p className="mt-1 text-sm text-gray-500">{body}</p>
      </Card>
    </button>
  );
}
