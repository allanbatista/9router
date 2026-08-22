"use client";

import PropTypes from "prop-types";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Card from "@/shared/components/Card";

const formatTokens = (value) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value || 0);
};

export default function InputTokensChart({ period }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/usage/chart?period=${period}`);
      if (response.ok) setData(await response.json());
    } catch (error) {
      console.error("Failed to fetch input token chart:", error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData = data.some((item) => item.uncachedInputTokens > 0 || item.cachedTokens > 0);

  return (
    <Card className="min-w-0 overflow-hidden p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-text-main">Input Tokens</h3>
          <p className="text-xs text-text-muted">Over time · without cache + cached</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Without cache</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-info" />Cached</span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-text-muted">Loading...</div>
      ) : !hasData ? (
        <div className="flex h-48 items-center justify-center text-sm text-text-muted">No input token data.</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 58 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.7 }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={64}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatTokens}
              width={54}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value, name) => [formatTokens(value), name === "cachedTokens" ? "Cached" : "Without cache"]}
            />
            <Bar dataKey="uncachedInputTokens" name="Without cache" stackId="input" fill="#6366f1" radius={[0, 0, 0, 0]} />
            <Bar dataKey="cachedTokens" name="Cached" stackId="input" fill="#06b6d4" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

InputTokensChart.propTypes = {
  period: PropTypes.string.isRequired,
};
