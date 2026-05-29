"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, FileUp, Save, Sparkles, TriangleAlert } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { RadarProfile } from "@/components/radar-chart";
import { mapCsvRows, getCleanName } from "@/lib/kpi/csv";
import { buildGroups, uniqueInstructorNames } from "@/lib/kpi/merge";
import { computeCoach } from "@/lib/kpi/coach";
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { GroupConfig, Position, RunCoach } from "@/lib/types";
import { cn, rm } from "@/lib/utils";
import { SortTh, TableToolbar, includesText, useTableSort } from "@/components/table-controls";

const GRADE_RANK: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };

interface CoachProfile {
  id: number;
  canonicalName: string;
  aliases: string[];
  center: string;
  defaultPosition: Position;
  lastMgmtAssessment: number | null;
  lastMgmtAssessmentAt: string | null;
  lastAllowance: number | null;
}

interface Acct {
  name: string;
  center: string;
  students: number;
  groupId: string;
}

interface GroupInputs {
  canonicalName: string;
  position: Position;
  allowance: number | null;
  /** Where the active allowance came from (drives the badge + re-fetch behavior). */
  allowanceSource: "auto" | "carryover" | "manual" | null;
  /** Profile carry-over (last month's allowance), used as a fallback. */
  carryAllowance: number | null;
  mgmt: number | null;
  /** Where the active mgmt assessment came from (drives the hint). */
  mgmtSource: "appraisal" | "carryover" | "manual" | null;
  lastMgmtAt: string | null;
  coachId: number | null;
  groupConfig: GroupConfig | null;
}

/** A coach's saved teaching allowance for the selected period (from /api/allowance/runs). */
interface AllowanceRec {
  coachId: number | null;
  canonicalName: string;
  teaching: number;
}

/** Match a merged coach to a period's allowance record: prefer coachId, else canonical name. */
function matchAllowance(
  list: AllowanceRec[],
  coachId: number | null,
  canonicalName: string,
): number | null {
  const rec =
    (coachId != null ? list.find((r) => r.coachId === coachId) : undefined) ??
    list.find((r) => r.canonicalName === canonicalName);
  return rec ? rec.teaching : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    // Surface the server's real error/status instead of a misleading
    // "Unexpected end of JSON input" from calling .json() on an empty error body.
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`${url} failed (${res.status})${body ? `: ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

function derivePeriod(filename: string): string {
  const m = filename.match(/(20\d{2})[^\d]?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthsAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 30) return "this month";
  return `${Math.floor(days / 30)} mo ago`;
}

export function Dashboard({
  appraisalOverall = {},
}: {
  /** Latest appraisal overall (0–100) keyed by coachId, to prefill the mgmt assessment. */
  appraisalOverall?: Record<string, number>;
}) {
  const [phase, setPhase] = useState<"upload" | "working">("upload");
  const [fileName, setFileName] = useState("");
  const [period, setPeriod] = useState("");
  const [rows, setRows] = useState<InstructorRow[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [accts, setAccts] = useState<Acct[]>([]);
  const [meta, setMeta] = useState<Record<string, GroupInputs>>({});
  const [aiStatus, setAiStatus] = useState<"idle" | "matching" | "done">("idle");
  const [parsing, setParsing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function onFile(file: File) {
    setParsing(true);
    setError("");
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        try {
          const parsed = mapCsvRows(res.data);
          setRows(parsed);
          setFileName(file.name);
          const derivedPeriod = derivePeriod(file.name);
          setPeriod(derivedPeriod);

          const [cfg, coachList] = await Promise.all([
            fetchJson<AppConfig>("/api/config"),
            fetchJson<CoachProfile[]>("/api/coaches"),
          ]);
          setConfig(cfg);

          const names = uniqueInstructorNames(parsed);
          const accountsForMatch = names.map((n) => {
            const rs = parsed.filter((r) => r.Instructor === n);
            return {
              name: n,
              center: rs[0]?.Center ?? "",
              students: rs.reduce((s, r) => s + r.TotalStudent, 0),
            };
          });

          setAiStatus("matching");
          let clusters: string[][] = [];
          try {
            const r = await fetch("/api/match-names", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accounts: accountsForMatch }),
            });
            clusters = ((await r.json()) as { clusters: string[][] }).clusters ?? [];
          } catch {
            /* deterministic merge still applies */
          }
          setAiStatus("done");

          const known = coachList.map((c) => ({
            canonicalName: c.canonicalName,
            aliases: c.aliases ?? [],
          }));
          const groups = buildGroups({ names, aiClusters: clusters, knownCoaches: known });

          const nextAccts: Acct[] = [];
          const nextMeta: Record<string, GroupInputs> = {};
          groups.forEach((g, i) => {
            const id = `g${i}`;
            g.accounts.forEach((a) => {
              const rs = parsed.filter((r) => r.Instructor === a);
              nextAccts.push({
                name: a,
                center: rs[0]?.Center ?? "",
                students: rs.reduce((s, r) => s + r.TotalStudent, 0),
                groupId: id,
              });
            });
            const profile = coachList.find(
              (c) =>
                c.canonicalName === g.canonicalName ||
                (c.aliases ?? []).some((al) => g.accounts.includes(al)),
            );
            const appraisalMgmt =
              profile?.id != null ? appraisalOverall[String(profile.id)] : undefined;
            nextMeta[id] = {
              canonicalName: g.canonicalName,
              position: profile?.defaultPosition ?? "Instructor",
              allowance: profile?.lastAllowance ?? null,
              allowanceSource: profile?.lastAllowance != null ? "carryover" : null,
              carryAllowance: profile?.lastAllowance ?? null,
              mgmt: appraisalMgmt ?? profile?.lastMgmtAssessment ?? null,
              mgmtSource:
                appraisalMgmt != null
                  ? "appraisal"
                  : profile?.lastMgmtAssessment != null
                    ? "carryover"
                    : null,
              lastMgmtAt: profile?.lastMgmtAssessmentAt ?? null,
              coachId: profile?.id ?? null,
              groupConfig: null,
            };
          });
          setAccts(nextAccts);
          setMeta(nextMeta);
          setPhase("working");
          await applyAllowanceForPeriod(derivedPeriod);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to process file");
        } finally {
          setParsing(false);
        }
      },
      error: (err) => {
        setError(err.message);
        setParsing(false);
      },
    });
  }

  /** Fetch the period's saved allowances and overlay them onto each coach's teaching allowance. */
  async function applyAllowanceForPeriod(p: string) {
    if (!p) return;
    let list: AllowanceRec[];
    try {
      list = await fetchJson<AllowanceRec[]>(`/api/allowance/runs?period=${encodeURIComponent(p)}`);
    } catch {
      return; // no allowances saved for this period — keep carry-over values
    }
    setMeta((prev) => {
      const next: Record<string, GroupInputs> = {};
      for (const [id, m] of Object.entries(prev)) {
        if (m.allowanceSource === "manual") {
          next[id] = m; // never clobber a manual override
          continue;
        }
        const auto = matchAllowance(list, m.coachId, m.canonicalName);
        if (auto != null) {
          next[id] = { ...m, allowance: auto, allowanceSource: "auto" };
        } else if (m.allowanceSource === "auto") {
          // an auto value from a different period no longer applies — fall back to carry-over
          next[id] = {
            ...m,
            allowance: m.carryAllowance,
            allowanceSource: m.carryAllowance != null ? "carryover" : null,
          };
        } else {
          next[id] = m;
        }
      }
      return next;
    });
  }

  const groups = useMemo(() => {
    if (!config) return [];
    const byId = new Map<string, Acct[]>();
    for (const a of accts) {
      const arr = byId.get(a.groupId) ?? [];
      arr.push(a);
      byId.set(a.groupId, arr);
    }
    const list = [...byId.entries()].map(([id, list]) => {
      const m = meta[id];
      const names = list.map((a) => a.name);
      const center = mostCommon(list.map((a) => a.center));
      const comp = computeCoach({
        accounts: names,
        rows,
        config,
        inputs: {
          position: m.position,
          teachingAllowance: m.allowance,
          mgmtAssessment: m.mgmt,
          groupConfig: m.groupConfig,
        },
      });
      return { id, names, accounts: list, center, meta: m, comp };
    });
    return list.sort((a, b) => b.comp.finalScore - a.comp.finalScore);
  }, [accts, meta, rows, config]);

  // Only coaches with a teaching allowance (auto-linked or manual) appear in the leaderboard.
  const ranked = useMemo(() => groups.filter((g) => (g.meta.allowance ?? 0) > 0), [groups]);
  const hiddenCount = groups.length - ranked.length;
  const incompleteCount = ranked.filter((g) => !g.comp.isComplete).length;

  // Display-only sort/filter — save() and exportCsv() always use the full `ranked` list.
  const [q, setQ] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const filtered = useMemo(
    () =>
      ranked.filter((g) => {
        if (!includesText(`${g.meta.canonicalName} ${g.center}`, q)) return false;
        if (positionFilter && g.meta.position !== positionFilter) return false;
        if (gradeFilter && !(g.comp.isComplete && g.comp.grade === gradeFilter)) return false;
        return true;
      }),
    [ranked, q, positionFilter, gradeFilter],
  );
  const {
    sorted: visible,
    sort,
    toggleSort,
  } = useTableSort(
    filtered,
    {
      name: (g) => g.meta.canonicalName,
      students: (g) => g.comp.students,
      position: (g) => g.meta.position,
      score: (g) => (g.comp.isComplete ? g.comp.finalScore : null),
      grade: (g) => (g.comp.isComplete ? (GRADE_RANK[g.comp.grade] ?? 0) : null),
      payout: (g) => (g.comp.isComplete ? g.comp.payout : null),
    },
    { key: "score", dir: "desc" },
  );

  function updateMeta(id: string, patch: Partial<GroupInputs>) {
    setMeta((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setSavedId(null);
  }

  function moveAccount(name: string, toGroupId: string) {
    let target = toGroupId;
    if (toGroupId === "NEW") {
      target = `s${Math.random().toString(36).slice(2, 8)}`;
      setMeta((m) => ({
        ...m,
        [target]: {
          canonicalName: getCleanName(name),
          position: "Instructor",
          allowance: null,
          allowanceSource: null,
          carryAllowance: null,
          mgmt: null,
          mgmtSource: null,
          lastMgmtAt: null,
          coachId: null,
          groupConfig: null,
        },
      }));
    }
    setAccts((prev) => prev.map((a) => (a.name === name ? { ...a, groupId: target } : a)));
    setSavedId(null);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    const coachResults: RunCoach[] = ranked.map((g) => ({
      coachId: g.meta.coachId,
      canonicalName: g.meta.canonicalName,
      accounts: g.names,
      center: g.center,
      position: g.meta.position,
      teachingAllowance: g.meta.allowance,
      mgmtAssessment: g.meta.mgmt,
      groupConfig: g.meta.groupConfig,
      students: g.comp.students,
      personalScore: g.comp.personalScore,
      groupScore: g.comp.groupScore,
      finalScore: g.comp.finalScore,
      grade: g.comp.grade,
      payout: g.comp.payout,
      breakdown: g.comp.breakdown,
      isComplete: g.comp.isComplete,
    }));
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel: period,
          filename: fileName,
          csvRows: rows,
          configSnapshot: config,
          coachResults,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const { id } = (await res.json()) as { id: number };
      setSavedId(id);
      toast.success("Month saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const headers = [
      "Coach",
      "Center",
      "Students",
      "Position",
      "Final Score",
      "Grade",
      "Allowance (RM)",
      "Payout (RM)",
      "Complete",
    ];
    const lines = ranked.map((g) =>
      [
        `"${g.meta.canonicalName}"`,
        `"${g.center}"`,
        g.comp.students,
        g.meta.position,
        g.comp.finalScore.toFixed(2),
        g.comp.grade,
        g.meta.allowance ?? 0,
        g.comp.payout.toFixed(0),
        g.comp.isComplete ? "yes" : "no",
      ].join(","),
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `KPI_${period}_payroll.csv`;
    link.click();
  }

  if (phase === "upload") {
    return (
      <div className="fade-in">
        <Card className="mx-auto max-w-xl p-8 text-center">
          <FileUp className="mx-auto mb-3 h-10 w-10 text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-900">Upload monthly KPI CSV</h2>
          <p className="mt-1 text-sm text-gray-500">
            Names are auto-merged with AI. Each coach&apos;s teaching allowance auto-links from the
            Allowance Calculator (override anytime); just fill in the management assessment.
          </p>
          <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            {parsing ? <Spinner /> : <FileUp className="h-4 w-4" />}
            {parsing ? "Processing…" : "Choose CSV file"}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              disabled={parsing}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </Card>
      </div>
    );
  }

  const detail = groups.find((g) => g.id === detailId);

  return (
    <div className="fade-in space-y-4">
      {/* Header / actions */}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="period">Period</Label>
            <Input
              id="period"
              type="month"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                void applyAllowanceForPeriod(e.target.value);
              }}
              className="mt-1 w-40"
            />
          </div>
          <div className="text-xs text-gray-500">
            <p>{fileName}</p>
            <p className="flex items-center gap-1">
              {aiStatus === "matching" ? (
                <>
                  <Spinner className="h-3 w-3 text-indigo-500" /> AI matching names…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 text-accent" /> {groups.length} coaches ·{" "}
                  {rows.length} rows
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} Save month
          </Button>
        </div>
      </Card>

      {savedId && (
        <p className="text-sm text-green-700">
          Saved to history. <a className="underline" href={`/kpi/history/${savedId}`}>View record →</a>
        </p>
      )}

      {/* Readiness banner */}
      {incompleteCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{incompleteCount}</strong> coach(es) still need management data (assessment /
            group hours). They&apos;re highlighted below.
          </span>
        </div>
      )}
      {hiddenCount > 0 && (
        <p className="text-xs text-gray-500">
          {hiddenCount} coach(es) hidden from the leaderboard — no teaching allowance for {period}.
          Save it in the Allowance Calculator for the same month to include them.
        </p>
      )}

      {/* Coaches table */}
      <Card className="overflow-hidden">
        <TableToolbar>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search coach…"
            className="w-44 py-1.5 text-xs"
          />
          <Select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="w-auto py-1.5 text-xs"
          >
            <option value="">All positions</option>
            <option value="Instructor">Instructor</option>
            <option value="Pool Supervisor">Supervisor</option>
          </Select>
          <Select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="w-auto py-1.5 text-xs"
          >
            <option value="">All grades</option>
            <option value="S">S</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </Select>
          <span className="ml-auto text-xs text-gray-500">
            {visible.length} of {ranked.length}
          </span>
        </TableToolbar>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <SortTh label="Coach" sortKey="name" sort={sort} onSort={toggleSort} className="px-3" />
                <SortTh label="Students" sortKey="students" sort={sort} onSort={toggleSort} align="center" className="px-3" />
                <SortTh label="Position" sortKey="position" sort={sort} onSort={toggleSort} className="px-3" />
                <th className="px-3 py-2 text-left">Allowance (RM)</th>
                <th className="px-3 py-2 text-left">Mgmt&nbsp;%</th>
                <SortTh label="Score" sortKey="score" sort={sort} onSort={toggleSort} align="center" className="px-3" />
                <SortTh label="Grade" sortKey="grade" sort={sort} onSort={toggleSort} align="center" className="px-3" />
                <SortTh label="Payout" sortKey="payout" sort={sort} onSort={toggleSort} align="right" className="px-3" />
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-500">
                    No coaches match the current filters.
                  </td>
                </tr>
              ) : (
                visible.map((g, idx) => (
                <tr
                  key={g.id}
                  className={cn(
                    "hover:bg-indigo-50/40",
                    !g.comp.isComplete && "bg-amber-50/50",
                  )}
                >
                  <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{g.meta.canonicalName}</div>
                    <div className="text-[11px] text-gray-400">
                      {g.center}
                      {g.names.length > 1 && (
                        <span className="ml-1 rounded bg-indigo-100 px-1 text-indigo-700">
                          merged {g.names.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600">{g.comp.students}</td>
                  <td className="px-3 py-2">
                    <Select
                      value={g.meta.position}
                      onChange={(e) => updateMeta(g.id, { position: e.target.value as Position })}
                      className="py-1 text-xs"
                    >
                      <option value="Instructor">Instructor</option>
                      <option value="Pool Supervisor">Supervisor</option>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={g.meta.allowance ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        updateMeta(g.id, {
                          allowance: e.target.value === "" ? null : Number(e.target.value),
                          allowanceSource: "manual",
                        })
                      }
                      className="w-24 py-1 text-xs"
                    />
                    {g.meta.allowanceSource === "auto" && (
                      <div className="text-[10px] font-medium text-brand">auto-linked</div>
                    )}
                    {g.meta.allowanceSource === "carryover" && (
                      <div className="text-[10px] text-gray-400">last month</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={g.meta.mgmt ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        updateMeta(g.id, {
                          mgmt: e.target.value === "" ? null : Number(e.target.value),
                          mgmtSource: "manual",
                        })
                      }
                      className="w-20 py-1 text-xs"
                    />
                    {g.meta.mgmtSource === "appraisal" ? (
                      <div className="text-[10px] font-medium text-brand">from latest appraisal</div>
                    ) : g.meta.lastMgmtAt ? (
                      <div className="text-[10px] text-gray-400">
                        last {monthsAgo(g.meta.lastMgmtAt)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-center font-bold text-indigo-600">
                    {g.comp.isComplete ? g.comp.finalScore.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {g.comp.isComplete ? (
                      <Badge className={g.comp.gradeClass}>{g.comp.grade}</Badge>
                    ) : (
                      <span className="text-[10px] text-amber-600">incomplete</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-green-700">
                    {g.comp.isComplete ? rm(g.comp.payout) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      onClick={() => setDetailId(g.id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && config && (
        <CoachDetail
          key={detail.id}
          name={detail.meta.canonicalName}
          position={detail.meta.position}
          finalScore={detail.comp.finalScore}
          grade={detail.comp.grade}
          gradeClass={detail.comp.gradeClass}
          payout={detail.comp.payout}
          students={detail.comp.students}
          breakdown={detail.comp.breakdown}
          accounts={detail.accounts}
          otherGroups={groups.filter((g) => g.id !== detail.id).map((g) => ({ id: g.id, name: g.meta.canonicalName }))}
          groupConfig={detail.meta.groupConfig}
          centers={[...new Set(rows.map((r) => r.Center))].sort()}
          onClose={() => setDetailId(null)}
          onMoveAccount={moveAccount}
          onGroupConfig={(gc) => updateMeta(detail.id, { groupConfig: gc })}
        />
      )}
    </div>
  );
}

function mostCommon(values: string[]): string {
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

interface DetailProps {
  name: string;
  position: Position;
  finalScore: number;
  grade: string;
  gradeClass: string;
  payout: number;
  students: number;
  breakdown: { name: string; score: number; displayValue: string; w: number; min: number; max: number; type: string }[];
  accounts: Acct[];
  otherGroups: { id: string; name: string }[];
  groupConfig: GroupConfig | null;
  centers: string[];
  onClose: () => void;
  onMoveAccount: (name: string, toGroupId: string) => void;
  onGroupConfig: (gc: GroupConfig) => void;
}

function CoachDetail(props: DetailProps) {
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(true);

  const payload = JSON.stringify({
    name: props.name,
    finalScore: props.finalScore,
    grade: props.grade,
    position: props.position,
    breakdown: props.breakdown.map((b) => ({
      name: b.name,
      score: b.score,
      displayValue: b.displayValue,
    })),
  });

  useEffect(() => {
    let active = true;
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    })
      .then((r) => r.json())
      .then((d: { text: string }) => active && setInsight(d.text))
      .catch(() => active && setInsight(""))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [payload]);

  const radarData = props.breakdown.map((b) => ({ metric: b.name, score: b.score }));

  return (
    <Drawer
      open
      onClose={props.onClose}
      header={
        <>
          <h3 className="text-h2 text-gray-900">{props.name}</h3>
          <p className="text-caption text-muted">
            {props.position} · {props.students} students
          </p>
        </>
      }
    >
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3">
            <p className="text-[11px] text-gray-500">Final Score</p>
            <p className="text-xl font-bold text-indigo-600">{props.finalScore.toFixed(2)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-gray-500">Grade</p>
            <p className="mt-1">
              <Badge className={props.gradeClass}>{props.grade}</Badge>
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-gray-500">Payout</p>
            <p className="text-xl font-bold text-green-700">{rm(props.payout)}</p>
          </Card>
        </div>

        <div className="mt-4 h-56">
          <RadarProfile data={radarData} />
        </div>

        <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
          <p className="mb-1 flex items-center gap-1 text-sm font-bold text-indigo-800">
            <Sparkles className="h-4 w-4 text-accent" /> AI Insight
          </p>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-indigo-700">
              <Spinner className="text-indigo-500" /> Analyzing…
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-gray-800">{insight}</p>
          )}
        </div>

        <div className="mt-4">
          <h4 className="mb-2 text-sm font-bold text-gray-700">Score Breakdown</h4>
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-1 text-left">Metric</th>
                <th className="py-1 text-center">Actual</th>
                <th className="py-1 text-center">Weight</th>
                <th className="py-1 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {props.breakdown.map((b) => (
                <tr key={b.name} className="border-t border-gray-100">
                  <td className="py-1 font-medium text-gray-800">{b.name}</td>
                  <td className="py-1 text-center text-gray-600">{b.displayValue}</td>
                  <td className="py-1 text-center text-gray-500">{(b.w * 100).toFixed(0)}%</td>
                  <td
                    className={cn(
                      "py-1 text-center font-semibold",
                      b.score >= 1.2 ? "text-green-600" : b.score < 0.8 ? "text-red-500" : "text-indigo-600",
                    )}
                  >
                    {b.score.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {props.position === "Pool Supervisor" && (
          <div className="mt-4 rounded-lg border border-gray-200 p-3">
            <h4 className="mb-2 text-sm font-bold text-gray-700">Supervisor Group Score</h4>
            <p className="mb-2 text-[11px] text-gray-500">
              Final score for a supervisor = (personal + center group score) / 2. Hours must total 40.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Center 1</Label>
                <Select
                  className="mt-1 py-1 text-xs"
                  value={props.groupConfig?.center1 ?? ""}
                  onChange={(e) =>
                    props.onGroupConfig({
                      center1: e.target.value,
                      hours1: props.groupConfig?.hours1 ?? 40,
                      center2: props.groupConfig?.center2,
                      hours2: props.groupConfig?.hours2,
                    })
                  }
                >
                  <option value="">— select —</option>
                  {props.centers.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Hours @ Center 1</Label>
                <Input
                  type="number"
                  className="mt-1 py-1 text-xs"
                  value={props.groupConfig?.hours1 ?? 40}
                  onChange={(e) =>
                    props.onGroupConfig({
                      center1: props.groupConfig?.center1 ?? "",
                      hours1: Number(e.target.value),
                      center2: props.groupConfig?.center2,
                      hours2: props.groupConfig?.hours2,
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <h4 className="mb-2 text-sm font-bold text-gray-700">Merged Accounts</h4>
          <div className="space-y-1">
            {props.accounts.map((a) => (
              <div key={a.name} className="flex items-center justify-between gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1 text-xs">
                <span className="truncate">
                  {a.name} <span className="text-gray-400">({a.students})</span>
                </span>
                <Select
                  className="w-36 py-0.5 text-[11px]"
                  value=""
                  onChange={(e) => e.target.value && props.onMoveAccount(a.name, e.target.value)}
                >
                  <option value="">move to…</option>
                  <option value="NEW">↪ new separate coach</option>
                  {props.otherGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      ↪ {g.name}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 no-print">
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="secondary" onClick={props.onClose}>
            Close
          </Button>
        </div>
    </Drawer>
  );
}
