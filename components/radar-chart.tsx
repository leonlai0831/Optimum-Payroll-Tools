"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

export function RadarProfile({ data }: { data: { metric: string; score: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="68%">
        <PolarGrid />
        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
        <PolarRadiusAxis domain={[0, 1.5]} tick={{ fontSize: 9 }} />
        <Radar dataKey="score" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.35} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
