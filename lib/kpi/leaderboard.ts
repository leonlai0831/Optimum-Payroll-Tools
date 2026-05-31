/**
 * Leaderboard gating: which coach groups actually appear (and get paid) in a
 * month's KPI bonus run.
 *
 * A group qualifies only when it has BOTH a teaching allowance AND real teaching
 * this month — students taught, or, for a Pool Supervisor, a group/center score.
 * Payout is `finalScore × allowance`, so without the teaching check a "ghost"
 * group — one that carries an inherited allowance but has no class (e.g. a
 * placeholder account like "VASSENTHAN HARVEST" split off as its own 0-student
 * group) — would be paid on zero students.
 */
export interface LeaderboardEligibility {
  /** Active teaching allowance for the month (auto-linked or manual). */
  allowance: number | null;
  /** Students taught this month (0 for a placeholder/ghost group). */
  students: number;
  /** Group/center score — lets a 0-personal-student supervisor still qualify. */
  groupScore: number;
}

export function appearsInLeaderboard(g: LeaderboardEligibility): boolean {
  return (g.allowance ?? 0) > 0 && (g.students > 0 || g.groupScore > 0);
}
