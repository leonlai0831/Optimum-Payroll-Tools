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
import { BarChart3, Sparkles } from "lucide-react";
import { Button, Card, Select, Spinner } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { TrendData } from "@/lib/db/queries";

const COLORS = [
  "#0061ff", "#fcb731", "#16a34a", "#dc2626", "#0891b2",
  "#9333ea", "#db2777", "#65a30d", "#ea580c", "#0a3d99",
];

export function TrendsView({ data }: { data: TrendData }) {
  const [metric, setMetric] = useState<"score" | "payout">("score");
  const [selected, setSelected] = useState<string[]>(() =>
    data.coaches.slice(0, 5).map((c) => c.name),
  );
  // AI trend narrative for one chosen coach (on demand).
  const [trendCoach, setTrendCoach] = useState<string>(() => data.coaches[0]?.name ?? "");
  const [trendText, setTrendText] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  async function analyzeTrend() {
    const coach = data.coaches.find((c) => c.name === trendCoach);
    if (!coach) return;
    setTrendLoading(true);
    setTrendText(null);
    try {
      const res = await fetch("/api/trend-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: coach.name, points: coach.points }),
      });
      const d = (await res.json()) as { text?: string };
      setTrendText(d.text ?? "");
    } catch {
      setTrendText("Could not analyze this trend right now.");
    } finally {
      setTrendLoading(false);
    }
  }

  if (data.periods.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No saved months yet"
        body="Save at least one month on the Dashboard to start seeing month-over-month trends."
      />
    );
  }

  const chartData = data.periods.map((p) => {
    const row: Record<string, string | number | null> = { period: p };
    for (const name of selected) {
      const coach = data.coaches.find((c) => c.name === name);
      const pt = coach?.points.find((x) => x.period === p);
      row[name] = pt ? (metric === "score" ? Number(pt.score.toFixed(2)) : Math.round(pt.payout)) : null;
    }
    return row;
  });

  function toggle(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <BarChart3 className="h-5 w-5 text-indigo-500" /> Month-over-Month Trends
        </h1>
        <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          {(["score", "payout"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                "rounded px-3 py-1 font-medium capitalize",
                metric === m ? "bg-indigo-600 text-white" : "text-gray-600",
              )}
            >
              {m}
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
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
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
      </Card>

      <Card className="p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Sparkles className="h-3.5 w-3.5 text-accent" /> AI trend analysis
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={trendCoach}
            onChange={(e) => {
              setTrendCoach(e.target.value);
              setTrendText(null);
            }}
            className="w-auto py-1.5 text-xs"
          >
            {data.coaches.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={analyzeTrend} disabled={trendLoading || !trendCoach}>
            {trendLoading ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {trendLoading ? "Analyzing…" : "Analyze"}
          </Button>
        </div>
        {trendText !== null && (
          <p className="mt-2 text-sm leading-relaxed text-gray-800">{trendText}</p>
        )}
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Coaches ({selected.length} selected)
        </p>
        <div className="flex flex-wrap gap-2">
          {data.coaches.map((c) => (
            <button
              key={c.name}
              onClick={() => toggle(c.name)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                selected.includes(c.name)
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
