import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, MessageSquareWarning } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { getLessonPlan } from "@/lib/db/queries";
import { Card } from "@/components/ui";
import { LessonPlanActions } from "@/components/lesson-plan-actions";
import { LessonPlanStatusBadge, LessonPlanTypeBadge } from "@/components/lesson-plan-badges";
import {
  LEVEL_TYPE_LABELS,
  OBJECTIVE_HELPER,
  REPLACEMENT_SECTIONS,
  SELF_EVAL_GROUPS,
} from "@/lib/lesson-plan/templates";

export const dynamic = "force-dynamic";

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-overline text-gray-400">{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value || "—"}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="border-b border-gray-200 pb-1 text-sm font-bold text-gray-900">{children}</h4>;
}

function SkillChips({ skills }: { skills: string[] }) {
  if (skills.length === 0) return <p className="mt-2 text-sm text-gray-400">None ticked.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <span
          key={s}
          className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
        >
          ✓ {s}
        </span>
      ))}
    </div>
  );
}

/** Read-only view of one saved plan, with the workflow actions for this viewer. */
export default async function LessonPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, plan] = await Promise.all([getCurrentUser(), getLessonPlan(Number(id))]);
  if (!user) redirect("/login");
  if (!plan) notFound();

  const [canEdit, canReview] = await Promise.all([
    userCan(user, "edit_lesson_plans"),
    userCan(user, "review_lesson_plans"),
  ]);
  const isOwner = canEdit && plan.createdByUserId === user.id;
  // Editors only ever open their own plans; reviewers can open anyone's.
  if (!isOwner && !canReview) notFound();

  const d = plan.data;
  const dateLabel = plan.lessonDate.toISOString().slice(0, 10);
  const reviewedStamp = plan.reviewedAt
    ? `${plan.reviewedByEmail} · ${new Date(plan.reviewedAt).toLocaleDateString()}`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/lesson-plans/history" className="flex items-center gap-1 text-xs text-indigo-600">
            <ArrowLeft className="h-3 w-3" /> Back to history
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-bold text-gray-900">
            {plan.instructorName}
            <LessonPlanTypeBadge type={plan.type} />
            <LessonPlanStatusBadge status={plan.status} />
          </h1>
          <p className="text-xs text-gray-500">
            {dateLabel}
            {plan.timeLabel && <> · {plan.timeLabel}</>}
            {plan.center && <> · {plan.center}</>}
            {plan.createdByName && <> · created by {plan.createdByName}</>}
          </p>
        </div>
        <LessonPlanActions id={plan.id} status={plan.status} isOwner={isOwner} canReview={canReview} />
      </div>

      {/* Status banner — the last review note stays visible even after edits. */}
      {plan.status === "submitted" && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Submitted and awaiting review.</span>
        </div>
      )}
      {plan.status === "approved" && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Approved{reviewedStamp && <> by {reviewedStamp}</>}.
            {plan.reviewNote && <> Note: {plan.reviewNote}</>}
          </span>
        </div>
      )}
      {plan.status === "changes_requested" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Changes requested</strong>
            {reviewedStamp && <> by {reviewedStamp}</>}: {plan.reviewNote || "—"}
          </span>
        </div>
      )}
      {plan.status === "draft" && plan.reviewNote && (
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Last review note{reviewedStamp && <> ({reviewedStamp})</>}: {plan.reviewNote}
          </span>
        </div>
      )}

      <Card className="space-y-5 p-4">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {plan.type === "replacement" && (
            <Meta label="Actual class instructor" value={plan.actualInstructorName} />
          )}
          <Meta
            label={plan.type === "replacement" ? "Replacement instructor" : "Instructor"}
            value={plan.instructorName}
          />
          <Meta label="Branch" value={plan.center} />
          <Meta label="Date" value={dateLabel} />
          <Meta label="Time" value={plan.timeLabel} />
          {plan.type === "replacement" ? (
            <Meta
              label="Level"
              value={`${plan.levelType ? LEVEL_TYPE_LABELS[plan.levelType] : "—"}${plan.classLevel ? ` · Level ${plan.classLevel}` : ""}`}
            />
          ) : (
            <>
              <Meta label="Class level" value={plan.classLevel} />
              <Meta label="Age group" value={plan.ageGroup} />
            </>
          )}
        </div>

        {/* Prior knowledge */}
        <div>
          <SectionHeading>
            {plan.type === "actual" ? "Students' prior knowledge" : "Student prior knowledge"}
          </SectionHeading>
          {plan.type === "actual" ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {d.priorKnowledge || "—"}
            </p>
          ) : (
            <SkillChips skills={d.priorSkills} />
          )}
        </div>

        {/* Objectives */}
        <div>
          <SectionHeading>Lesson objectives</SectionHeading>
          {plan.type === "replacement" && (
            <p className="mt-1 text-xs text-gray-400">{OBJECTIVE_HELPER}</p>
          )}
          <ol className="mt-2 space-y-1.5">
            {d.objectives.map((obj, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="w-6 shrink-0 font-semibold text-gray-400">
                  {plan.type === "actual" ? `${i + 1}.` : `(${"abc"[i] ?? i + 1})`}
                </span>
                <span>{obj || "—"}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Procedure */}
        <div>
          <SectionHeading>Procedure</SectionHeading>
          {plan.type === "actual" ? (
            d.procedure.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">No procedure rows.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {d.procedure.map((row, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Step {i + 1}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                      {row.activity || "—"}
                    </p>
                    <dl className="mt-2 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
                      <div>
                        <dt className="font-semibold text-gray-400">Time</dt>
                        <dd>{row.time || "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-400">Materials</dt>
                        <dd>{row.materials || "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-400">Advance preparation</dt>
                        <dd>{row.advancePreparation || "—"}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="mt-2 space-y-3">
              {REPLACEMENT_SECTIONS.map((def) => {
                const s = d.sections.find((x) => x.key === def.key);
                return (
                  <div key={def.key} className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      {def.label}
                    </div>
                    {s?.intro && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{s.intro}</p>
                    )}
                    <SkillChips
                      skills={[...(s?.skills ?? []), ...(s?.otherSkill ? [s.otherSkill] : [])]}
                    />
                    <dl className="mt-2 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
                      <div>
                        <dt className="font-semibold text-gray-400">Time</dt>
                        <dd>{s?.time || "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-400">Materials</dt>
                        <dd>{s?.materials || "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-400">Advanced preparation</dt>
                        <dd>{s?.advancedPreparation || "—"}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {plan.type === "replacement" && (
          <>
            <div>
              <SectionHeading>Remarks</SectionHeading>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{d.remarks || "—"}</p>
            </div>
            <div>
              <SectionHeading>Teaching performance self-evaluation</SectionHeading>
              {SELF_EVAL_GROUPS.map((group) => (
                <div key={group.key} className="mt-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    {group.title}
                  </div>
                  <div className="mt-1 divide-y divide-gray-100">
                    {group.questions.map((q) => {
                      const a = d.selfEval[q.key];
                      return (
                        <div
                          key={q.key}
                          className="flex items-center justify-between gap-3 py-1.5 text-sm"
                        >
                          <span className="min-w-0 text-gray-700">{q.label}</span>
                          <span
                            className={
                              a === "yes"
                                ? "shrink-0 font-semibold text-green-700"
                                : a === "no"
                                  ? "shrink-0 font-semibold text-gray-900"
                                  : "shrink-0 text-gray-300"
                            }
                          >
                            {a === "yes" ? "Yes" : a === "no" ? "No" : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
