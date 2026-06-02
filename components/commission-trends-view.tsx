"use client";

import { useState } from "react";
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
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { cn, rm } from "@/lib/utils";
import type { CommissionTrendData } from "@/lib/db/queries";

const COLORS = [
  "#0061ff", "#fcb731", "#16a34a", "#dc2626", "#0891b2",
  "#9333ea", "#db2777", "#65a30d", "#ea580c", "#0a3d99",
];

type CompanyMetric = "commission" | "rate" | "qualifying";
const METRIC_LABEL: Record<CompanyMetric, string> = {
  commission: "Total commission",
  rate: "Commission rate",
  qualifying: "Qualifying registrations",
};

export function CommissionTrendsView({ data }: { data: CommissionTrendData }) {
  const [metric, setMetric] = useState<CompanyMetric>("commission");
  const [selected, setSelected] = useState<string[]>(() => data.staff.slice(0, 5).map((s) => s.name));

  if (data.periods.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No saved months yet"
        body="Save at least one month on the Calculator to start seeing month-over-month commission trends."
      />
    );
  }

  const companyData = data.totals.map((t) => ({
    period: t.period,
    value: metric === "rate" ? Number((t.rate * 100).toFixed(1)) : metric === "qualifying" ? t.qualifying : Math.round(t.commission),
  }));

  const staffData = data.periods.map((p) => {
    const row: Record<string, string | number | null> = { period: p };
    for (const name of selected) {
      const pt = data.staff.find((s) => s.name === name)?.points.find((x) => x.period === p);
      row[name] = pt ? Math.round(pt.commission) : null;
    }
    return row;
  });

  function toggle(name: string) {
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  const fmt = (v: number) => (metric === "rate" ? `${v}%` : metric === "qualifying" ? String(v) : rm(v));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <BarChart3 className="h-5 w-5 text-brand" /> Month-over-month commission
        </h1>
        <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          {(Object.keys(METRIC_LABEL) as CompanyMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                "rounded px-3 py-1 font-medium",
                metric === m ? "bg-brand text-white" : "text-gray-600",
              )}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{METRIC_LABEL[metric]}</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={companyData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Line type="monotone" dataKey="value" name={METRIC_LABEL[metric]} stroke="#0061ff" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Per-staff commission ({selected.length} selected)
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={staffData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => rm(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {selected.map((name, i) => (
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
        <div className="mt-3 flex flex-wrap gap-2">
          {data.staff.map((s) => (
            <button
              key={s.name}
              onClick={() => toggle(s.name)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                selected.includes(s.name)
                  ? "border-brand/40 bg-brand/10 text-brand"
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
