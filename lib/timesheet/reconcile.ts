// Freelancer clock-in × fixed-schedule reconciliation (P1 core).
// The schedule is the validator (operator model, 2026-06-13): an approved
// clock-in that lands on a scheduled occurrence is FIXED; one that doesn't is a
// REPLACEMENT; a scheduled occurrence with no clock-in is an ABSENCE. A center
// with any absence is marked `absent`, which the freelancer engine reads to
// forfeit the attendance bonus — auto-deriving what used to be a manual flag.
// Pure + deterministic so it can be unit-locked (payroll).

import type { FreelancerCenterRow } from "@/lib/freelancer/types";
import type { TimesheetClassType } from "./types";

/**
 * One recurring slot in a freelancer's fixed schedule. The matching rule uses
 * `weekday + center + classType` only; start/end times live on the stored row
 * for display but DON'T affect classification in v1 — billable hours always
 * come from the actual clock-in, never the planned slot.
 */
export interface ScheduleSlot {
  weekday: number; // 0 = Sunday … 6 = Saturday (UTC)
  center: string;
  classType?: TimesheetClassType | null; // null for front-desk shifts
}

/** One approved clock-in to reconcile against the schedule. */
export interface ReconcileEntry {
  date: string; // YYYY-MM-DD
  center: string;
  classType?: TimesheetClassType | null;
  hours: number;
}

export interface Absence {
  date: string;
  center: string;
  classType: TimesheetClassType | null;
}

export interface ReconcileResult {
  /** Per-center fixed/replaced hours with `absent` set when the center has ≥1
   *  missed scheduled occurrence. Feeds `FreelancerInput.centerRows` directly. */
  centerRows: FreelancerCenterRow[];
  /** Every scheduled occurrence that had no matching clock-in. */
  absences: Absence[];
}

function centerKey(center: string): string {
  return center.trim().toUpperCase();
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of `month` (month is 1-based here).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

interface Occurrence {
  date: string;
  centerK: string;
  classType: TimesheetClassType | null;
  consumed: boolean;
}

/**
 * Reconcile one freelancer's approved clock-ins against their fixed schedule
 * for a single month.
 *
 * @param month 1–12
 */
export function reconcileFreelancer(
  schedule: ScheduleSlot[],
  entries: ReconcileEntry[],
  year: number,
  month: number,
): ReconcileResult {
  // 1. Expand the weekly schedule into dated occurrences for the month.
  const occurrences: Occurrence[] = [];
  const total = daysInMonth(year, month);
  for (let day = 1; day <= total; day++) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    for (const slot of schedule) {
      if (slot.weekday !== weekday) continue;
      occurrences.push({
        date,
        centerK: centerKey(slot.center),
        classType: slot.classType ?? null,
        consumed: false,
      });
    }
  }

  // Per-center accumulator, keyed + labelled by the canonical center code.
  const rows = new Map<string, FreelancerCenterRow>();
  const order: string[] = [];
  const rowFor = (k: string): FreelancerCenterRow => {
    let row = rows.get(k);
    if (!row) {
      row = { center: k, replacedHours: 0, fixedHours: 0, absent: false };
      rows.set(k, row);
      order.push(k);
    }
    return row;
  };

  // 2. Classify each entry against an unconsumed matching occurrence.
  for (const e of entries) {
    const k = centerKey(e.center);
    const ct = e.classType ?? null;
    const match = occurrences.find(
      (o) => !o.consumed && o.date === e.date && o.centerK === k && o.classType === ct,
    );
    const row = rowFor(k);
    if (match) {
      match.consumed = true;
      row.fixedHours += e.hours;
    } else {
      row.replacedHours += e.hours;
    }
  }

  // 3. Any scheduled occurrence with no clock-in is an absence → center absent.
  const absences: Absence[] = [];
  for (const o of occurrences) {
    if (o.consumed) continue;
    absences.push({ date: o.date, center: o.centerK, classType: o.classType });
    rowFor(o.centerK).absent = true;
  }

  return { centerRows: order.map((k) => rows.get(k)!), absences };
}
