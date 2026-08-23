"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Card from "@/shared/components/Card";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

export default function UsageChart({ period = "7d" }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("all"); // "all" | "tokens" | "cost"

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage/chart?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to fetch chart data:", e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData = data.some((d) => d.tokens > 0 || d.cost > 0 || d.cachedTokens > 0);

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      {/* Header with Title, Legend and Mode Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-lg bg-primary/10 text-primary material-symbols-outlined text-[20px]">
            multiline_chart
          </span>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-text-main">Token Consumption & Trends</h3>
            <p className="text-xs text-text-muted">Stacked Input (Uncached + Cached) with Total Token Curve and Cost</p>
          </div>
        </div>

        {/* Visual Legend / Metric Toggles */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-text-muted">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
            <span>Uncached Input</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-text-muted">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
            <span>Cached Input</span>
          </div>

          {viewMode === "all" || viewMode === "cost" ? (
            <div className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-0.5 bg-emerald-500" />
              <span>Cost ($)</span>
            </div>
          ) : null}

          {/* View Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-lg border border-border bg-bg">
            <button
              onClick={() => setViewMode("all")}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === "all" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text-main"}`}
            >
              Combined
            </button>
            <button
              onClick={() => setViewMode("tokens")}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === "tokens" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text-main"}`}
            >
              Tokens
            </button>
            <button
              onClick={() => setViewMode("cost")}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === "cost" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text-main"}`}
            >
              Cost
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-text-muted text-sm gap-2">
          <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
          Loading trends...
        </div>
      ) : !hasData ? (
        <div className="h-64 flex flex-col items-center justify-center text-text-muted text-sm gap-1">
          <span className="material-symbols-outlined text-[28px] opacity-40">query_stats</span>
          <span>No usage activity recorded for this period</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 20 }}>
            <defs>
              <linearGradient id="gradTotalCurve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.08} vertical={false} />
            
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.6 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            
            {/* Primary Y Axis (Tokens) */}
            {(viewMode === "all" || viewMode === "tokens") && (
              <YAxis
                yAxisId="tokensAxis"
                orientation="left"
                tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.6 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtTokens}
                width={54}
              />
            )}

            {/* Secondary Y Axis (Cost $) */}
            {(viewMode === "all" || viewMode === "cost") && (
              <YAxis
                yAxisId="costAxis"
                orientation={viewMode === "cost" ? "left" : "right"}
                tick={{ fontSize: 11, fill: "#10b981", fillOpacity: 0.8 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtCost}
                width={58}
              />
            )}

            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "12px",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
                fontSize: "12px",
                padding: "10px 14px"
              }}
              formatter={(value, name) => {
                if (name === "Cost ($)") return [fmtCost(value), name];
                return [fmtTokens(value), name];
              }}
            />

            {/* 1. Stacked Bars: Uncached Input + Cached Input */}
            {(viewMode === "all" || viewMode === "tokens") && (
              <Bar
                yAxisId="tokensAxis"
                dataKey="uncachedInputTokens"
                name="Uncached Input"
                stackId="tokensStack"
                fill="#0ea5e9"
                radius={[0, 0, 0, 0]}
                maxBarSize={44}
              />
            )}
            {(viewMode === "all" || viewMode === "tokens") && (
              <Bar
                yAxisId="tokensAxis"
                dataKey="cachedTokens"
                name="Cached Input"
                stackId="tokensStack"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
              />
            )}

            {/* 2. Cost Line Curve (Rendered AFTER bars so it stays in FRONT/FOREGROUND) */}
            {(viewMode === "all" || viewMode === "cost") && (
              <Line
                yAxisId="costAxis"
                type="monotone"
                dataKey="cost"
                name="Cost ($)"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 3, fill: "#10b981", stroke: "#064e3b", strokeWidth: 1.5 }}
                activeDot={{ r: 6, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
};
