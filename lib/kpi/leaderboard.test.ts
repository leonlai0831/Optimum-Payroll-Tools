import { describe, expect, it } from "vitest";
import { appearsInLeaderboard } from "./leaderboard";

describe("appearsInLeaderboard", () => {
  it("includes a normal coach: allowance + students taught", () => {
    expect(appearsInLeaderboard({ allowance: 1134, students: 82, groupScore: 0 })).toBe(true);
  });

  it("excludes a ghost group: inherited allowance but 0 students and no group score", () => {
    // The real "VASSENTHAN HARVEST" case — a placeholder split into its own
    // 0-student group that still inherited the coach's carried-over allowance.
    expect(appearsInLeaderboard({ allowance: 1134, students: 0, groupScore: 0 })).toBe(false);
  });

  it("excludes a coach with students but no allowance (hidden, not paid)", () => {
    expect(appearsInLeaderboard({ allowance: 0, students: 82, groupScore: 0 })).toBe(false);
    expect(appearsInLeaderboard({ allowance: null, students: 82, groupScore: 0 })).toBe(false);
  });

  it("includes a Pool Supervisor with 0 personal students but a group score", () => {
    expect(appearsInLeaderboard({ allowance: 1500, students: 0, groupScore: 1.1 })).toBe(true);
  });
});
