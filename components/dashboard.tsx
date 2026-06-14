"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileUp, Link2, Save, Sparkles, TriangleAlert } from "lucide-react";
import { CoachResultPdfButton } from "@/components/coach-result-pdf-button";
import { Drawer } from "@/components/drawer";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { SearchableSelect } from "@/components/searchable-select";
import dynamic from "next/dynamic";
import { mapCsvRows, getCleanName } from "@/lib/kpi/csv";
import { makeCenterNormalizer } from "@/lib/allowance/centers";
import { buildGroups, uniqueInstructorNames } from "@/lib/kpi/merge";
import { classifyAccount, type AccountKind } from "@/lib/kpi/classify";
import {
  linkAllowance,
  orphanLinkableAllowances,
  type CoachLinkInfo,
} from "@/lib/kpi/allowance-link";
import { appearsInLeaderboard } from "@/lib/kpi/leaderboard";
import type { CsvAnomaly } from "@/lib/ai/anthropic";
import { isLinkableTier, nonLinkableReason } from "@/lib/allowance/tier-rules";
import type { AllowanceConfig, AllowanceTier } from "@/lib/allowance/types";
import { computeCoach } from "@/lib/kpi/coach";
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { GroupConfig, Position, RunCoach } from "@/lib/types";
import { fetchJson } from "@/lib/http";
import { cn, rm } from "@/lib/utils";
import { SortTh, TableToolbar, includesText, useTableSort } from "@/components/table-controls";

const GRADE_RANK: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };

/** Short tags shown next to non-primary accounts in the merge editor. */
const KIND_LABEL: Record<AccountKind, string> = {
  primary: "primary",
  numbered: "overflow",
  placeholder: "promo",
  coteach: "co-teach",
};

interface CoachProfile {
  id: number;
  canonicalName: string;
  aliases: string[];
  center: string;
  defaultPosition: Position;
  lastMgmtAssessment: number | null;
  lastMgmtAssessmentAt: string | null;
  lastAllowance: number | null;
  /** Persisted "don't KPI-link this coach" override (managed on /kpi/links). */
  kpiLinkNa?: boolean;
}

interface Acct {
  name: string;
  center: string;
  students: number;
  groupId: string;
  /** Classifier verdict: primary / numbered / placeholder / coteach. */
  kind: AccountKind;
  /** Whether this account counts toward the coach's individual KPI. */
  include: boolean;
}

// recharts is heavy; load the radar only on the client, after the page paints.
const RadarProfile = dynamic(
  () => import("@/components/radar-chart").then((m) => ({ default: m.RadarProfile })),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-gray-50" /> },
);

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
  mgmtSource: "assessment" | "carryover" | "manual" | null;
  lastMgmtAt: string | null;
  coachId: number | null;
  groupConfig: GroupConfig | null;
}

/** A coach's saved teaching allowance for the selected period (from /api/allowance/runs). */
interface AllowanceRec {
  coachId: number | null;
  canonicalName: string;
  teaching: number;
  /** Pay tier — drives whether this record may link to a KPI coach at all. */
  tier: AllowanceTier;
  /** CSV account aliases of this allowance's coach profile (for tolerant linking). */
  aliases?: string[];
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

/** Currency comparison tolerance — half a sen, so float dust never reads as a divergence. */
const ALLOWANCE_EPSILON = 0.005;

/**
 * The saved Allowance-run amount that DIFFERS from a coach's entered allowance (a
 * payroll-risk divergence to flag), or null when it matches / is blank / has no saved
 * record. One source of truth so the headline count and the per-row marker never disagree.
 */
function divergedAllowance(
  saved: Map<string, number>,
  g: { id: string; meta: GroupInputs },
): number | null {
  if (g.meta.allowanceSource !== "manual" || g.meta.allowance == null) return null;
  const amt = saved.get(g.id);
  return amt != null && Math.abs(amt - g.meta.allowance) > ALLOWANCE_EPSILON ? amt : null;
}

/** Inline amber advisory banner (warning icon + message) shared by the dashboard notices. */
function AmberAlert({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** A staged machine-pushed delivery to seed the dashboard with (/kpi?ingest=<id>). */
export interface IngestSeed {
  ingestId: number;
  /** Sender's filename/note — shown where the uploaded filename would be. */
  label: string;
  periodLabel: string;
  /** Already-normalized rows (the ingest API ran the CSV header mapping). */
  rows: InstructorRow[];
}

export function Dashboard({
  assessmentFinal = {},
  seed = null,
}: {
  /** Latest assessment final % (0–100) keyed by coachId, to prefill the mgmt assessment. */
  assessmentFinal?: Record<string, number>;
  /** When set, skip the file upload and process these staged rows instead. */
  seed?: IngestSeed | null;
}) {
  const [phase, setPhase] = useState<"upload" | "working">("upload");
  const [fileName, setFileName] = useState("");
  const [period, setPeriod] = useState("");
  const [rows, setRows] = useState<InstructorRow[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [coachList, setCoachList] = useState<CoachProfile[]>([]);
  /** Allowance records for the active period + how each linked, for the link panel. */
  const [allowanceRecs, setAllowanceRecs] = useState<AllowanceRec[]>([]);
  /** coachIds the user marked "not applicable" this session — hidden from the panel. */
  const [naRecs, setNaRecs] = useState<Set<number>>(() => new Set());
  /** True once the period's allowance fetch has resolved — gates the "no allowance saved" prompt. */
  const [allowanceChecked, setAllowanceChecked] = useState(false);
  /** Monotonic id of the latest allowance fetch — a stale (superseded) response is ignored. */
  const allowanceReq = useRef(0);
  const [accts, setAccts] = useState<Acct[]>([]);
  const [meta, setMeta] = useState<Record<string, GroupInputs>>({});
  const [aiStatus, setAiStatus] = useState<"idle" | "matching" | "done">("idle");
  /** AI data-quality warnings for the uploaded month (advisory; dismissible). */
  const [anomalies, setAnomalies] = useState<CsvAnomaly[]>([]);
  const [anomaliesDismissed, setAnomaliesDismissed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [savedId, setSavedId] = useState<number | null>(null);
  const [savedStatus, setSavedStatus] = useState<"draft" | "finalized">("finalized");

  async function onFile(file: File) {
    setParsing(true);
    // Lazy-load PapaParse (~45 KB) only when a file is actually parsed.
    const Papa = (await import("papaparse")).default;
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        try {
          await processRows(mapCsvRows(res.data), file.name);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to process file");
        } finally {
          setParsing(false);
        }
      },
      error: (err) => {
        toast.error(err.message);
        setParsing(false);
      },
    });
  }

  // Seed from a staged ingest exactly once on mount — from there on the month
  // behaves as if its rows had been file-uploaded. A ref (not state) guards the
  // one-shot so the effect body stays free of synchronous setState. The phase
  // stays "upload" (showing the seed loading card) until processRows flips it.
  const seedStarted = useRef(false);
  useEffect(() => {
    if (!seed || seedStarted.current) return;
    seedStarted.current = true;
    processRows(seed.rows, seed.label, seed.periodLabel).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Failed to load staged upload"),
    );
    // processRows/toast are stable for the lifetime of the component; this only fires for the seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  /**
   * Shared post-parse pipeline — the CSV upload and a staged-ingest seed both
   * land here, so an API-pushed month goes through the exact same merge editor →
   * compute → review flow as a hand-uploaded file.
   */
  async function processRows(
    rawParsed: InstructorRow[],
    sourceName: string,
    periodOverride?: string,
  ) {
    setFileName(sourceName);
    const derivedPeriod = periodOverride ?? derivePeriod(sourceName);
    setPeriod(derivedPeriod);

    const [cfg, coachList, allowanceCfg] = await Promise.all([
      fetchJson<AppConfig>("/api/config"),
      fetchJson<CoachProfile[]>("/api/coaches?roster=kpi"),
      fetchJson<AllowanceConfig>("/api/allowance/config"),
    ]);
    // Normalize raw CSV center labels (a mix of codes + full names) onto the
    // operator's configured center codes via the alias map from Staff settings.
    const normCenter = makeCenterNormalizer(
      allowanceCfg.centers ?? [],
      allowanceCfg.centerAliases ?? {},
    );
    const parsed = rawParsed.map((r) => ({ ...r, Center: normCenter(r.Center) }));
    setRows(parsed);
    setConfig(cfg);
    setCoachList(coachList);
    // Seed the session NA set from persisted "not applicable" overrides.
    setNaRecs(new Set(coachList.filter((c) => c.kpiLinkNa).map((c) => c.id)));

    const names = uniqueInstructorNames(parsed);
    const accountsForMatch = names.map((n) => {
      const rs = parsed.filter((r) => r.Instructor === n);
      return {
        name: n,
        center: rs[0]?.Center ?? "",
        students: rs.reduce((s, r) => s + r.TotalStudent, 0),
      };
    });

    // Fire the AI data-quality check in the background — advisory only, so
    // it must never block or delay the merge/scoring path below.
    setAnomalies([]);
    setAnomaliesDismissed(false);
    void fetch("/api/validate-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current: accountsForMatch.map((a) => ({
          instructor: a.name,
          center: a.center,
          students: a.students,
        })),
      }),
    })
      .then((r) => r.json() as Promise<{ anomalies?: CsvAnomaly[] }>)
      .then((d) => setAnomalies(d.anomalies ?? []))
      .catch(() => {
        /* advisory only — ignore failures */
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
    const groups = buildGroups({
      names,
      aiClusters: clusters,
      knownCoaches: known,
      classifyConfig: cfg.classify,
    });

    const nextAccts: Acct[] = [];
    const nextMeta: Record<string, GroupInputs> = {};
    groups.forEach((g, i) => {
      const id = `g${i}`;
      g.accounts.forEach((a) => {
        const rs = parsed.filter((r) => r.Instructor === a);
        const cl = classifyAccount(a, cfg.classify);
        nextAccts.push({
          name: a,
          center: rs[0]?.Center ?? "",
          students: rs.reduce((s, r) => s + r.TotalStudent, 0),
          groupId: id,
          kind: cl.kind,
          include: cl.defaultInclude,
        });
      });
      const profile = coachList.find(
        (c) =>
          c.canonicalName === g.canonicalName ||
          (c.aliases ?? []).some((al) => g.accounts.includes(al)),
      );
      const assessmentMgmt =
        profile?.id != null ? assessmentFinal[String(profile.id)] : undefined;
      nextMeta[id] = {
        canonicalName: g.canonicalName,
        position: profile?.defaultPosition ?? "Instructor",
        allowance: profile?.lastAllowance ?? null,
        allowanceSource: profile?.lastAllowance != null ? "carryover" : null,
        carryAllowance: profile?.lastAllowance ?? null,
        mgmt: assessmentMgmt ?? profile?.lastMgmtAssessment ?? null,
        mgmtSource:
          assessmentMgmt != null
            ? "assessment"
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
    // Pass the freshly-fetched coach list + accounts explicitly so alias
    // enrichment doesn't depend on state having flushed yet.
    await applyAllowanceForPeriod(derivedPeriod, { profiles: coachList, accts: nextAccts });
  }

  /** Fetch the period's saved allowances and overlay them onto each coach's teaching allowance. */
  async function applyAllowanceForPeriod(
    p: string,
    override?: { profiles: CoachProfile[]; accts: Acct[] },
  ) {
    if (!p) return;
    // A quick period change fires overlapping fetches; only the latest may write state,
    // so a slow earlier response can't clobber the current period's allowances/banners.
    const reqId = ++allowanceReq.current;
    setAllowanceChecked(false);
    let list: AllowanceRec[];
    try {
      list = await fetchJson<AllowanceRec[]>(`/api/allowance/runs?period=${encodeURIComponent(p)}`);
    } catch {
      if (allowanceReq.current === reqId) {
        setAllowanceRecs([]);
        setAllowanceChecked(true);
      }
      return; // no allowances saved for this period — keep carry-over values
    }
    if (allowanceReq.current !== reqId) return; // superseded by a newer period fetch
    // Enrich each record with its coach profile's account aliases so a short KPI
    // name (VASSEN) can still link to a full allowance name (VASSENTHAN).
    const profiles = override?.profiles ?? coachList;
    const aliasById = new Map(profiles.map((c) => [c.id, c.aliases ?? []]));
    const enriched = list.map((r) => ({
      ...r,
      aliases: r.coachId != null ? aliasById.get(r.coachId) ?? [] : [],
    }));
    setAllowanceRecs(enriched);

    // Accounts-per-group, from the explicit override or current state.
    const acctsByGroup = new Map<string, string[]>();
    const readAccts = (cur: Acct[]) => {
      for (const a of cur) {
        const arr = acctsByGroup.get(a.groupId) ?? [];
        arr.push(a.name);
        acctsByGroup.set(a.groupId, arr);
      }
    };
    if (override) readAccts(override.accts);
    else setAccts((cur) => (readAccts(cur), cur));

    setMeta((prev) => {
      const next: Record<string, GroupInputs> = {};
      for (const [id, m] of Object.entries(prev)) {
        if (m.allowanceSource === "manual") {
          next[id] = m; // never clobber a manual override
          continue;
        }
        const coach: CoachLinkInfo = {
          coachId: m.coachId,
          canonicalName: m.canonicalName,
          accounts: acctsByGroup.get(id) ?? [],
        };
        const linked = linkAllowance(enriched, coach).rec;
        if (linked) {
          next[id] = { ...m, allowance: linked.teaching, allowanceSource: "auto" };
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
    setAllowanceChecked(true);
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
      // Only included accounts feed the score; numbered/placeholder/co-teach
      // rows default out but stay in the group for the merge editor.
      const includedNames = list.filter((a) => a.include).map((a) => a.name);
      const center = mostCommon(list.map((a) => a.center));
      const comp = computeCoach({
        accounts: includedNames,
        rows,
        config,
        inputs: {
          position: m.position,
          teachingAllowance: m.allowance,
          mgmtAssessment: m.mgmt,
          groupConfig: m.groupConfig,
        },
      });
      return { id, names, includedNames, accounts: list, center, meta: m, comp };
    });
    return list.sort((a, b) => b.comp.finalScore - a.comp.finalScore);
  }, [accts, meta, rows, config]);

  // A coach appears in the leaderboard only with a teaching allowance AND real
  // teaching this month (students, or a supervisor's group score) — see
  // appearsInLeaderboard. Keeps out "ghost" groups that inherit an allowance but
  // have no class (e.g. a "… HARVEST" placeholder split into its own 0-student group).
  const ranked = useMemo(
    () =>
      groups.filter((g) =>
        appearsInLeaderboard({
          allowance: g.meta.allowance,
          students: g.comp.students,
          groupScore: g.comp.groupScore,
        }),
      ),
    [groups],
  );
  const hiddenCount = groups.length - ranked.length;
  const incompleteCount = ranked.filter((g) => !g.comp.isComplete).length;

  // Reconcile this month's allowance records against the uploaded coaches, so we
  // can surface records that were entered but linked to nobody (the actionable
  // "I entered 30 but only see 2" signal). Non-teaching tiers (A1–A3, PA, T0)
  // are excluded — they never link, so they aren't "missing" links.
  const { orphanAllowances, nonLinkableCount } = useMemo(() => {
    if (allowanceRecs.length === 0) return { orphanAllowances: [], nonLinkableCount: 0 };
    const coachInfos: CoachLinkInfo[] = groups.map((g) => ({
      coachId: g.meta.coachId,
      canonicalName: g.meta.canonicalName,
      accounts: g.accounts.map((a) => a.name),
    }));
    const { orphans, nonLinkableCount } = orphanLinkableAllowances(allowanceRecs, coachInfos);
    return {
      // Hide records the operator explicitly marked "not applicable" this session.
      orphanAllowances: orphans.filter((r) => !naRecs.has(r.coachId ?? -1)),
      nonLinkableCount,
    };
  }, [allowanceRecs, groups, naRecs]);

  // The saved Allowance-run amount that auto-links to each coach, keyed by group id.
  // Lets the editor flag a MANUAL allowance that diverges from this authoritative value
  // (a payroll risk: a typed number that won't match what the Allowance Calculator paid).
  // Mirrors the auto-overlay link in applyAllowanceForPeriod so "what would have
  // auto-linked" stays consistent between the two.
  const savedAllowanceByGroup = useMemo(() => {
    const map = new Map<string, number>();
    if (allowanceRecs.length === 0) return map;
    for (const g of groups) {
      const linked = linkAllowance(allowanceRecs, {
        coachId: g.meta.coachId,
        canonicalName: g.meta.canonicalName,
        accounts: g.accounts.map((a) => a.name),
      }).rec;
      if (linked) map.set(g.id, linked.teaching);
    }
    return map;
  }, [allowanceRecs, groups]);

  // Coaches whose manually-entered allowance differs from the saved Allowance run.
  const overriddenAllowanceCount = useMemo(
    () => ranked.filter((g) => divergedAllowance(savedAllowanceByGroup, g) !== null).length,
    [ranked, savedAllowanceByGroup],
  );

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
    const toNew = toGroupId === "NEW";
    if (toNew) {
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
    // Reassigning an account to its own coach means it should count there;
    // a plain move keeps whatever include state it had.
    setAccts((prev) =>
      prev.map((a) =>
        a.name === name ? { ...a, groupId: target, include: toNew ? true : a.include } : a,
      ),
    );
    setSavedId(null);
  }

  function setAccountInclude(name: string, include: boolean) {
    setAccts((prev) => prev.map((a) => (a.name === name ? { ...a, include } : a)));
    setSavedId(null);
  }

  /** Manually attach an unmatched allowance record to a coach group in this upload. */
  function linkAllowanceToCoach(rec: AllowanceRec, groupId: string) {
    // Non-teaching tiers (A1–A3, PA, T0) have no class — block the link.
    if (!isLinkableTier(rec.tier)) {
      toast.error(`${rec.canonicalName} (${rec.tier}) can’t be linked: ${nonLinkableReason(rec.tier)}`);
      return;
    }
    setMeta((prev) => {
      const m = prev[groupId];
      if (!m) return prev;
      return {
        ...prev,
        // Adopt the record's coachId so the link persists by id on save, and
        // overlay its teaching allowance as an auto link.
        [groupId]: {
          ...m,
          allowance: rec.teaching,
          allowanceSource: "auto",
          coachId: m.coachId ?? rec.coachId,
        },
      };
    });
    // Drop it from the orphan list immediately.
    setAllowanceRecs((prev) => prev.filter((r) => r !== rec));
    setSavedId(null);
  }

  /** Mark an allowance record "not applicable" — hide it + persist so it sticks next month. */
  function markNotApplicable(rec: AllowanceRec) {
    if (rec.coachId != null) {
      const coachId = rec.coachId;
      setNaRecs((prev) => new Set(prev).add(coachId));
      // Persist on the coach profile so the link page + next month respect it.
      void fetch(`/api/kpi/links/${coachId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpiLinkNa: true, naTier: rec.tier }),
      }).catch(() => {
        /* best-effort; session hide already applied */
      });
    } else {
      setAllowanceRecs((prev) => prev.filter((r) => r !== rec));
    }
    setSavedId(null);
  }

  /** Flatten a merge group + its computed scores into the persisted RunCoach shape. */
  function toRunCoach(g: (typeof groups)[number]): RunCoach {
    return {
      coachId: g.meta.coachId,
      canonicalName: g.meta.canonicalName,
      accounts: g.includedNames,
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
    };
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    const coachResults: RunCoach[] = ranked.map(toRunCoach);
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
          // When this month came from a staged API delivery, link it so the
          // ingest flips to "imported" with a pointer at the saved run.
          ...(seed ? { ingestId: seed.ingestId } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const { id, status } = (await res.json()) as { id: number; status: "draft" | "finalized" };
      setSavedId(id);
      setSavedStatus(status);
      toast.success(
        status === "draft" ? "Saved as draft — pending management review." : "Month finalized.",
      );
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

  // Seeded from a staged ingest: show a loading card instead of the file picker
  // while the shared pipeline (config fetch + name matching) runs.
  if (phase === "upload" && seed) {
    return (
      <div className="fade-in">
        <Card className="mx-auto max-w-xl p-8 text-center">
          <Spinner className="mx-auto mb-3 h-8 w-8 text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-900">Loading staged upload…</h2>
          <p className="mt-1 text-sm text-gray-500">
            {seed.label} · {seed.periodLabel} · {seed.rows.length} rows
          </p>
        </Card>
      </div>
    );
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
        </Card>
      </div>
    );
  }

  const detail = groups.find((g) => g.id === detailId);

  // Shared inline-field renderers so the desktop table and the mobile cards edit
  // through the exact same handlers — one source of truth for the editable cells.
  // `inputClass` lets each layout size the control (compact in the table,
  // full-width + larger touch target on mobile cards).
  type Row = (typeof visible)[number];
  const positionField = (g: Row, inputClass = "py-1 text-xs") => (
    <Select
      value={g.meta.position}
      onChange={(e) => updateMeta(g.id, { position: e.target.value as Position })}
      className={inputClass}
    >
      <option value="Instructor">Instructor</option>
      <option value="Pool Supervisor">Supervisor</option>
    </Select>
  );
  const allowanceField = (g: Row, inputClass = "w-24 py-1 text-xs") => {
    const diverged = divergedAllowance(savedAllowanceByGroup, g);
    return (
      <>
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
          className={inputClass}
        />
        {g.meta.allowanceSource === "auto" && (
          <div className="text-[10px] font-medium text-brand">auto-linked</div>
        )}
        {g.meta.allowanceSource === "carryover" && (
          <div className="text-[10px] text-gray-400">last month</div>
        )}
        {diverged != null && (
          <div className="text-[10px] font-medium text-amber-600">⚠ saved {rm(diverged)}</div>
        )}
      </>
    );
  };
  // Mgmt % is locked when an assessment record drives it — no manual override.
  const mgmtField = (g: Row, inputClass = "w-20 py-1 text-xs") => (
    <>
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
        disabled={g.meta.mgmtSource === "assessment"}
        className={inputClass}
      />
      {g.meta.mgmtSource === "assessment" ? (
        <div className="text-[10px] font-medium text-brand">from assessment · locked</div>
      ) : g.meta.lastMgmtAt ? (
        <div className="text-[10px] text-gray-400">last {monthsAgo(g.meta.lastMgmtAt)}</div>
      ) : null}
    </>
  );

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
        <p className={cn("text-sm", savedStatus === "draft" ? "text-amber-700" : "text-green-700")}>
          {savedStatus === "draft" ? (
            <>
              Saved as draft — pending management review.{" "}
              <a className="underline" href={`/kpi/history/${savedId}`}>Review &amp; finalize →</a>
            </>
          ) : (
            <>
              Saved to history.{" "}
              <a className="underline" href={`/kpi/history/${savedId}`}>View record →</a>
            </>
          )}
        </p>
      )}

      {/* AI data-quality warnings (advisory; dismissible). */}
      {anomalies.length > 0 && !anomaliesDismissed && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold text-rose-900">
              <TriangleAlert className="h-4 w-4" /> AI flagged {anomalies.length} thing(s) to review
            </span>
            <button
              type="button"
              className="text-xs font-medium text-rose-500 hover:underline"
              onClick={() => setAnomaliesDismissed(true)}
            >
              Dismiss
            </button>
          </div>
          <ul className="space-y-1">
            {anomalies.map((a, i) => (
              <li key={`${a.account}-${i}`} className="flex items-start gap-1.5 text-rose-800">
                <Badge
                  className={cn(
                    "mt-0.5 shrink-0",
                    a.severity === "high"
                      ? "bg-rose-200 text-rose-900"
                      : a.severity === "medium"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-600",
                  )}
                >
                  {a.severity}
                </Badge>
                <span>
                  <strong>{a.account}</strong> — {a.message}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-rose-400">
            Advisory only — review and correct in the data if needed; nothing is changed automatically.
          </p>
        </div>
      )}

      {/* Readiness banner */}
      {incompleteCount > 0 && (
        <AmberAlert>
          <strong>{incompleteCount}</strong>{" "}coach(es) still need management data (assessment /
          group hours). They&apos;re highlighted below.
        </AmberAlert>
      )}
      {/* No allowance saved for this period at all — prompt to enter it. The values
          below are carry-over (where a profile has one) and may not be this month's pay. */}
      {allowanceChecked && period && allowanceRecs.length === 0 && groups.length > 0 && (
        <AmberAlert>
          No allowance saved for <strong>{period}</strong>{" "}yet. The allowance values below are last
          month&apos;s carry-over (where available) and may not be this month&apos;s pay.{" "}
          <a className="font-medium underline" href="/allowance">
            Save this month in the Allowance Calculator
          </a>{" "}
          so it links automatically, or enter each coach&apos;s teaching allowance below before
          saving.
        </AmberAlert>
      )}

      {/* A manual allowance that diverges from the saved Allowance run — a payroll risk
          (the typed number won't match what the Allowance Calculator paid). */}
      {period && overriddenAllowanceCount > 0 && (
        <AmberAlert>
          <strong>{overriddenAllowanceCount}</strong>{" "}coach(es) have a teaching allowance that
          differs from the saved Allowance run for {period}. The manual value is used as entered —
          rows that differ are marked below with the saved amount. Confirm it&apos;s intentional.
        </AmberAlert>
      )}
      {hiddenCount > 0 && (
        <p className="text-xs text-gray-500">
          {hiddenCount} coach(es) hidden from the leaderboard — no teaching allowance for {period},
          or no class data this month. Save the allowance in the Allowance Calculator for the same
          month to include the ones who taught.
        </p>
      )}

      {/* Allowance link panel: records entered for this month that matched no coach. */}
      {orphanAllowances.length > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
            <Link2 className="h-4 w-4" />
            {orphanAllowances.length} allowance record(s) for {period} didn&apos;t match a coach
          </p>
          <p className="mb-2 text-xs text-indigo-800/80">
            These were entered in the Allowance Calculator but their name doesn&apos;t match any
            uploaded coach. Link each to the right coach — it&apos;s remembered as an alias, so next
            month links automatically. Pick <strong>Not applicable</strong> to skip one.
            {nonLinkableCount > 0 && (
              <> {nonLinkableCount} admin/T0 record(s) are hidden — those tiers don&apos;t teach.</>
            )}
          </p>
          <div className="space-y-1">
            {orphanAllowances.map((r) => (
              <div
                key={`${r.coachId ?? r.canonicalName}`}
                className="flex items-center justify-between gap-2 rounded border border-indigo-100 bg-white px-2 py-1 text-xs"
              >
                <span className="truncate">
                  <span className="font-medium text-gray-900">{r.canonicalName}</span>{" "}
                  <span className="text-gray-400">· {r.tier} · {rm(r.teaching)}</span>
                </span>
                <SearchableSelect
                  className="w-44"
                  placeholder="link to coach…"
                  searchPlaceholder="Search coach…"
                  pinned={[{ value: "NA", label: "⊘ Not applicable (don’t link)" }]}
                  options={groups
                    .filter((g) => g.meta.allowanceSource !== "auto")
                    .map((g) => ({
                      value: g.id,
                      label: `${g.meta.canonicalName} (${g.comp.students} students)`,
                    }))}
                  onSelect={(value) => {
                    if (value === "NA") markNotApplicable(r);
                    else if (value) linkAllowanceToCoach(r, value);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
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

        {/* Mobile (< lg): card list. A 9-column editable table only scrolls
            sideways on a phone, which is how managers actually use this — cards
            read far better and keep the inputs tappable. */}
        <div className="divide-y divide-gray-100 lg:hidden">
          {visible.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No coaches match the current filters.
            </div>
          ) : (
            visible.map((g, idx) => (
              <div key={g.id} className={cn("p-4", !g.comp.isComplete && "bg-amber-50/50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                      <span className="truncate font-semibold text-gray-900">
                        {g.meta.canonicalName}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      {g.center}
                      {g.names.length > 1 && (
                        <span className="ml-1 rounded bg-indigo-100 px-1 text-indigo-700">
                          merged {g.names.length}
                        </span>
                      )}
                      <span className="ml-1">· {g.comp.students} students</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {g.comp.isComplete ? (
                      <>
                        <span className="text-lg font-bold text-indigo-600">
                          {g.comp.finalScore.toFixed(2)}
                        </span>
                        <Badge className={g.comp.gradeClass}>{g.comp.grade}</Badge>
                      </>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-600">incomplete</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-overline text-muted">Position</span>
                    <div className="mt-1">{positionField(g, "w-full py-2 text-sm")}</div>
                  </label>
                  <label className="block">
                    <span className="text-overline text-muted">Allowance (RM)</span>
                    <div className="mt-1">{allowanceField(g, "w-full py-2 text-sm")}</div>
                  </label>
                  <label className="block">
                    <span className="text-overline text-muted">Mgmt&nbsp;%</span>
                    <div className="mt-1">{mgmtField(g, "w-full py-2 text-sm")}</div>
                  </label>
                  <div className="flex flex-col">
                    <span className="text-overline text-muted">Payout</span>
                    <div className="mt-1 text-base font-bold text-green-700">
                      {g.comp.isComplete ? rm(g.comp.payout) : "—"}
                    </div>
                  </div>
                </div>

                <button
                  className="mt-3 w-full rounded-md border border-gray-200 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100"
                  onClick={() => setDetailId(g.id)}
                >
                  View breakdown
                </button>
              </div>
            ))
          )}
        </div>

        {/* Desktop (lg+): the full editable table. */}
        <div className="hidden overflow-x-auto lg:block">
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
                  <td className="px-3 py-2">{positionField(g)}</td>
                  <td className="px-3 py-2">{allowanceField(g)}</td>
                  <td className="px-3 py-2">{mgmtField(g)}</td>
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
          runCoach={toRunCoach(detail)}
          periodLabel={period}
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
          onToggleInclude={setAccountInclude}
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
  /** The coach flattened to the persisted shape — drives the PDF export. */
  runCoach: RunCoach;
  /** The upload's period label (e.g. "2026-04") — stamped onto the PDF. */
  periodLabel: string;
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
  onToggleInclude: (name: string, include: boolean) => void;
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-h2 text-gray-900">{props.name}</h3>
            <p className="text-caption text-muted">
              {props.position} · {props.students} students
            </p>
          </div>
          <CoachResultPdfButton
            className="shrink-0"
            coach={props.runCoach}
            periodLabel={props.periodLabel}
          />
        </div>
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
            <div className="space-y-2" role="status" aria-label="Analyzing">
              <Skeleton className="h-3.5 w-full bg-indigo-100" />
              <Skeleton className="h-3.5 w-[92%] bg-indigo-100" />
              <Skeleton className="h-3.5 w-3/4 bg-indigo-100" />
            </div>
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
          <h4 className="mb-1 text-sm font-bold text-gray-700">Accounts in this coach</h4>
          <p className="mb-2 text-[11px] text-gray-500">
            Untick overflow / promo / co-teach classes that shouldn&apos;t count toward this coach.
            Co-teach classes start off — tick them under whoever should be credited, or move them to
            the other coach.
          </p>
          <div className="space-y-1">
            {props.accounts.map((a) => (
              <div
                key={a.name}
                className={cn(
                  "flex items-center gap-2 rounded border border-gray-100 px-2 py-1 text-xs",
                  a.include ? "bg-gray-50" : "bg-white opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-indigo-600"
                  checked={a.include}
                  title="Count this account toward the coach's KPI"
                  onChange={(e) => props.onToggleInclude(a.name, e.target.checked)}
                />
                <span className="flex-1 truncate">
                  {a.name} <span className="text-gray-400">({a.students})</span>
                  {a.kind !== "primary" && (
                    <span className="ml-1 rounded bg-gray-200 px-1 text-[10px] text-gray-600">
                      {KIND_LABEL[a.kind]}
                    </span>
                  )}
                </span>
                <Select
                  className="w-32 py-0.5 text-[11px]"
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
