"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Score-over-time line chart for a coach profile. Split into its own module and
 * lazy-loaded so recharts stays out of the profile page's initial bundle.
 */
export default function ProfileScoreChart({
  data,
}: {
  data: { period: string; score: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} domain={[0, "auto"]} />
        <Tooltip />
        <Line type="monotone" dataKey="score" stroke="#0061ff" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
