"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { cn, rm } from "@/lib/utils";
import type { AllowanceTrendData } from "@/lib/db/queries";

const COLORS = [
  "#0061ff", "#fcb731", "#16a34a", "#dc2626", "#0891b2",
  "#9333ea", "#db2777", "#65a30d", "#ea580c", "#0a3d99",
];

export function AllowanceTrendsView({ data }: { data: AllowanceTrendData }) {
  const [mode, setMode] = useState<"staff" | "center">("staff");
  const series = mode === "staff" ? data.byStaff : data.byCenter;

  const [selected, setSelected] = useState<string[]>([]);
  // Default selection: first 5 of whichever grouping is active.
  const active = useMemo(() => {
    if (selected.length) return selected.filter((n) => series.some((s) => s.name === n));
    return series.slice(0, 5).map((s) => s.name);
  }, [selected, series]);

  if (data.periods.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No saved allowances yet"
        body="Save at least one month's allowances to start seeing month-over-month trends."
      />
    );
  }

  const chartData = data.periods.map((p) => {
    const row: Record<string, string | number | null> = { period: p };
    for (const name of active) {
      const s = series.find((x) => x.name === name);
      const pt = s?.points.find((x) => x.period === p);
      row[name] = pt ? pt.total : null;
    }
    return row;
  });

  function toggle(name: string) {
    const base = active;
    setSelected(base.includes(name) ? base.filter((n) => n !== name) : [...base, name]);
  }

  return (
    <div className="fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <TrendingUp className="h-5 w-5 text-indigo-500" /> Allowance Trends
        </h1>
        <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          {(["staff", "center"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setSelected([]);
              }}
              className={cn(
                "rounded px-3 py-1 font-medium capitalize",
                mode === m ? "bg-indigo-600 text-white" : "text-gray-600",
              )}
            >
              By {m}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-4">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => rm(Number(v))} width={70} />
              <Tooltip formatter={(v) => rm(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {active.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  connectNulls
                  dot={{ r: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {mode === "staff" ? "Staff" : "Centers"} ({active.length} selected)
        </p>
        <div className="flex flex-wrap gap-2">
          {series.map((s) => (
            <button
              key={s.name}
              onClick={() => toggle(s.name)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                active.includes(s.name)
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
