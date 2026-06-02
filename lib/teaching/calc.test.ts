import { describe, it, expect } from "vitest";
import { classKind, computeTeaching, teachingMonthLabel } from "./calc";
import { DEFAULT_TEACHING_CONFIG } from "./defaults";
import type { TeachingRow } from "./types";

function row(p: Partial<TeachingRow> & { className: string; staffName: string }): TeachingRow {
  return {
    sessionStart: p.sessionStart ?? "2026-05-01 10:00",
    sessionEnd: p.sessionEnd ?? "2026-05-01 10:45",
    className: p.className,
    staffName: p.staffName,
    userName: p.userName ?? "",
    userEmail: p.userEmail ?? "",
    userPhone: p.userPhone ?? "",
    paidAt: p.paidAt ?? "",
  };
}

// Alpha: PT slot S1 (1 attendee) + PT slot S2 (2 attendees, same time) + 1 group
// class (3 attendees). Beta: 1 PT attendee.
const FIXTURE: TeachingRow[] = [
  row({ className: "Fitness Appointment Classes", staffName: "Alpha", sessionStart: "2026-05-02 10:00", sessionEnd: "2026-05-02 10:45", userName: "X" }),
  row({ className: "Fitness Appointment Classes", staffName: "Alpha", sessionStart: "2026-05-02 11:00", sessionEnd: "2026-05-02 11:45", userName: "Y" }),
  row({ className: "Fitness Appointment Classes", staffName: "Alpha", sessionStart: "2026-05-02 11:00", sessionEnd: "2026-05-02 11:45", userName: "Z" }),
  row({ className: "Strength and Sweat", staffName: "Alpha", sessionStart: "2026-05-02 18:00", sessionEnd: "2026-05-02 18:45", userName: "P" }),
  row({ className: "Strength and Sweat", staffName: "Alpha", sessionStart: "2026-05-02 18:00", sessionEnd: "2026-05-02 18:45", userName: "Q" }),
  row({ className: "Strength and Sweat", staffName: "Alpha", sessionStart: "2026-05-02 18:00", sessionEnd: "2026-05-02 18:45", userName: "R" }),
  row({ className: "Fitness Appointment Classes", staffName: "Beta", sessionStart: "2026-05-03 09:00", sessionEnd: "2026-05-03 09:45", userName: "M" }),
];

describe("classKind", () => {
  it("PT when the class name contains an appointment keyword; group otherwise", () => {
    expect(classKind("Fitness Appointment Classes", ["appointment"])).toBe("pt");
    expect(classKind("Strength and Sweat", ["appointment"])).toBe("group");
    expect(classKind("Metcon Foundation", ["appointment"])).toBe("group");
  });
});

describe("computeTeaching", () => {
  const sum = computeTeaching(FIXTURE, DEFAULT_TEACHING_CONFIG);

  it("pays PT per attendee and group per distinct session", () => {
    const alpha = sum.coaches.find((c) => c.staffName === "Alpha")!;
    expect(alpha.ptAttendees).toBe(3); // X, Y, Z
    expect(alpha.ptSessions).toBe(2); // two distinct appointment slots
    expect(alpha.ptIncome).toBe(90); // 3 × 30
    expect(alpha.groupSessions).toBe(1); // one Strength session (3 attendees)
    expect(alpha.groupAttendees).toBe(3);
    expect(alpha.groupIncome).toBe(75); // 1 × 75
    expect(alpha.totalIncome).toBe(165);
  });

  it("sorts coaches by income desc and totals across coaches", () => {
    expect(sum.coaches.map((c) => c.staffName)).toEqual(["Alpha", "Beta"]);
    expect(sum.coaches[1].totalIncome).toBe(30); // Beta: 1 PT attendee
    expect(sum.totals.ptIncome).toBe(120);
    expect(sum.totals.groupIncome).toBe(75);
    expect(sum.totals.totalIncome).toBe(195);
  });

  it("gives a per-class breakdown", () => {
    const alpha = sum.coaches.find((c) => c.staffName === "Alpha")!;
    const pt = alpha.classes.find((c) => c.className === "Fitness Appointment Classes")!;
    expect(pt.kind).toBe("pt");
    expect(pt.sessions).toBe(2);
    expect(pt.attendees).toBe(3);
    expect(pt.income).toBe(90);
  });
});

describe("teachingMonthLabel", () => {
  it("derives a month label from session-start dates", () => {
    expect(teachingMonthLabel(FIXTURE)).toBe("May 2026");
  });
});
