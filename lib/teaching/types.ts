// Optimum Fit — coach teaching-income domain types.
//
// One monthly export (class_session_attendees) is parsed into `TeachingRow`s
// (one row per attendee per session), then the pure engine in `calc.ts` derives
// each coach's income: PT is paid per ATTENDEE (a 2-person appointment = 2× the
// PT rate), group classes per distinct SESSION (flat, any headcount).

export type ClassKind = "pt" | "group";

/** One attendee of one class session (one source row). */
export interface TeachingRow {
  /** Normalised "yyyy-mm-dd hh:mm". */
  sessionStart: string;
  sessionEnd: string;
  className: string;
  staffName: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  paidAt: string;
}

/** Editable rates + PT classification, persisted as a singleton. */
export interface TeachingConfig {
  /** RM per PT attendee. */
  ptRate: number;
  /** RM per group-class session. */
  groupRate: number;
  /** A class counts as PT if its name contains any of these (case-insensitive); else group. */
  ptKeywords: string[];
}

export interface ClassBreakdown {
  className: string;
  kind: ClassKind;
  sessions: number;
  attendees: number;
  income: number;
}

export interface CoachIncome {
  staffName: string;
  ptSessions: number;
  ptAttendees: number;
  groupSessions: number;
  groupAttendees: number;
  ptIncome: number;
  groupIncome: number;
  totalIncome: number;
  classes: ClassBreakdown[];
}

export interface TeachingSummary {
  coaches: CoachIncome[];
  totals: {
    ptSessions: number;
    ptAttendees: number;
    groupSessions: number;
    groupAttendees: number;
    ptIncome: number;
    groupIncome: number;
    totalIncome: number;
  };
}
