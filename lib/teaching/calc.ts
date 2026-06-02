// Pure teaching-income engine — no I/O. PT is paid per attendee; group classes
// per distinct session. Locked by calc.test.ts.

import type {
  ClassBreakdown,
  ClassKind,
  CoachIncome,
  TeachingConfig,
  TeachingRow,
  TeachingSummary,
} from "./types";

/** A class is PT if its name contains any PT keyword (case-insensitive); else group. */
export function classKind(className: string, ptKeywords: string[]): ClassKind {
  const n = className.toLowerCase();
  return ptKeywords.some((k) => k && n.includes(k.toLowerCase())) ? "pt" : "group";
}

/** Unique session key within a coach: start + end + class. */
function sessionKey(r: TeachingRow): string {
  return `${r.sessionStart}|${r.sessionEnd}|${r.className}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Human month label ("May 2026") from the most common session-start year-month. */
export function teachingMonthLabel(rows: TeachingRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const ym = r.sessionStart.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) counts.set(ym, (counts.get(ym) ?? 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  for (const [ym, c] of counts) {
    if (c > bestCount) {
      best = ym;
      bestCount = c;
    }
  }
  if (!best) return "Teaching";
  const [y, m] = best.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

/** Per-coach teaching income for one month. */
export function computeTeaching(rows: TeachingRow[], config: TeachingConfig): TeachingSummary {
  const byCoach = new Map<string, TeachingRow[]>();
  for (const r of rows) {
    const name = r.staffName.trim();
    if (!name) continue; // rows without a coach can't be attributed
    const arr = byCoach.get(name);
    if (arr) arr.push(r);
    else byCoach.set(name, [r]);
  }

  const coaches: CoachIncome[] = [];
  for (const [name, rs] of byCoach) {
    const ptSessions = new Set<string>();
    const groupSessions = new Set<string>();
    let ptAttendees = 0;
    let groupAttendees = 0;
    const classMap = new Map<string, { kind: ClassKind; sessions: Set<string>; attendees: number }>();

    for (const r of rs) {
      const kind = classKind(r.className, config.ptKeywords);
      const sk = sessionKey(r);
      if (kind === "pt") {
        ptAttendees++;
        ptSessions.add(sk);
      } else {
        groupAttendees++;
        groupSessions.add(sk);
      }
      const cm = classMap.get(r.className) ?? { kind, sessions: new Set<string>(), attendees: 0 };
      cm.sessions.add(sk);
      cm.attendees++;
      classMap.set(r.className, cm);
    }

    const ptIncome = ptAttendees * config.ptRate;
    const groupIncome = groupSessions.size * config.groupRate;
    const classes: ClassBreakdown[] = [...classMap.entries()]
      .map(([className, cm]) => ({
        className,
        kind: cm.kind,
        sessions: cm.sessions.size,
        attendees: cm.attendees,
        income: cm.kind === "pt" ? cm.attendees * config.ptRate : cm.sessions.size * config.groupRate,
      }))
      .sort((a, b) => b.income - a.income || a.className.localeCompare(b.className));

    coaches.push({
      staffName: name,
      ptSessions: ptSessions.size,
      ptAttendees,
      groupSessions: groupSessions.size,
      groupAttendees,
      ptIncome,
      groupIncome,
      totalIncome: ptIncome + groupIncome,
      classes,
    });
  }

  coaches.sort((a, b) => b.totalIncome - a.totalIncome || a.staffName.localeCompare(b.staffName));

  const totals = coaches.reduce(
    (t, c) => ({
      ptSessions: t.ptSessions + c.ptSessions,
      ptAttendees: t.ptAttendees + c.ptAttendees,
      groupSessions: t.groupSessions + c.groupSessions,
      groupAttendees: t.groupAttendees + c.groupAttendees,
      ptIncome: t.ptIncome + c.ptIncome,
      groupIncome: t.groupIncome + c.groupIncome,
      totalIncome: t.totalIncome + c.totalIncome,
    }),
    { ptSessions: 0, ptAttendees: 0, groupSessions: 0, groupAttendees: 0, ptIncome: 0, groupIncome: 0, totalIncome: 0 },
  );

  return { coaches, totals };
}
