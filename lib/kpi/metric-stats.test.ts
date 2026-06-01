import { describe, expect, it } from "vitest";
import { aggregateMetricStats, type MetricValue } from "./metric-stats";

describe("aggregateMetricStats", () => {
  it("groups by metric id and computes min/median/max", () => {
    const items: MetricValue[] = [
      { id: "students", name: "Student Number", raw: 100 },
      { id: "students", name: "Student Number", raw: 200 },
      { id: "students", name: "Student Number", raw: 300 },
      { id: "retention", name: "Retention", raw: 0.98 },
    ];
    const stats = aggregateMetricStats(items);
    const students = stats.find((s) => s.id === "students")!;
    expect(students.count).toBe(3);
    expect(students.min).toBe(100);
    expect(students.median).toBe(200);
    expect(students.max).toBe(300);
    expect(stats.find((s) => s.id === "retention")!.median).toBeCloseTo(0.98);
  });

  it("averages the two middle values for an even count", () => {
    const items: MetricValue[] = [
      { id: "m", name: "M", raw: 10 },
      { id: "m", name: "M", raw: 20 },
      { id: "m", name: "M", raw: 30 },
      { id: "m", name: "M", raw: 40 },
    ];
    expect(aggregateMetricStats(items)[0].median).toBe(25);
  });

  it("ignores non-finite values and empty input", () => {
    expect(aggregateMetricStats([])).toEqual([]);
    const stats = aggregateMetricStats([
      { id: "m", name: "M", raw: Number.NaN },
      { id: "m", name: "M", raw: 5 },
    ]);
    expect(stats[0].count).toBe(1);
    expect(stats[0].median).toBe(5);
  });
});
