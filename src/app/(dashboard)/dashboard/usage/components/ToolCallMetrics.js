"use client";

import PropTypes from "prop-types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "@/shared/components/Badge";
import Card from "@/shared/components/Card";

const TOOL_COLORS = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#64748b", "#14b8a6"];
const fmt = (value) => Number(value || 0).toLocaleString();

function formatTooltipValue(value, name) {
  return [fmt(value), name];
}

export default function ToolCallMetrics({ stats }) {
  const rankedTools = Object.entries(stats?.byToolName || {})
    .sort(([, a], [, b]) => (b.calls || 0) - (a.calls || 0))
    .map(([name]) => name);
  const namedTools = rankedTools
    .slice(0, rankedTools.length > TOOL_COLORS.length ? TOOL_COLORS.length - 1 : TOOL_COLORS.length);
  const hasOther = rankedTools.length > namedTools.length;
  const toolNames = [...namedTools, ...(hasOther ? ["Other"] : [])];
  const timeline = (stats?.toolCallTimeline || []).map((bucket) => {
    const row = { ...bucket };
    for (const name of namedTools) row[name] = bucket.byToolName?.[name] || 0;
    if (hasOther) {
      row.Other = Object.entries(bucket.byToolName || {})
        .filter(([name]) => !namedTools.includes(name))
        .reduce((total, [, count]) => total + count, 0);
    }
    return row;
  });
  const agentTypes = Object.entries(stats?.byAgentRequestType || {})
    .sort(([, a], [, b]) => b - a);

  if (!timeline.length || !stats?.toolCallCount) return null;

  return (
    <Card className="flex min-w-0 flex-col gap-4 overflow-hidden" padding="md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-purple-500">build</span>
            <h3 className="text-sm font-semibold text-text-main sm:text-base">Tool-call Metrics</h3>
          </div>
          <p className="mt-1 text-xs text-text-muted">Calls by time, stacked by tool name.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <Badge variant="primary" size="sm">{fmt(stats.toolCallCount)} tool-calls</Badge>
          <Badge variant="neutral" size="sm">{fmt(stats.toolCallRequests)} requests</Badge>
        </div>
      </div>

      {agentTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-text-muted">Agent request types:</span>
          {agentTypes.map(([type, count]) => (
            <Badge key={type} variant="neutral" size="sm">{type}: {fmt(count)}</Badge>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={timeline} margin={{ top: 12, right: 16, left: 8, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.08} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            interval={timeline.length > 24 ? "preserveStartEnd" : 3}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            width={52}
            label={{ value: "Tool calls", angle: -90, position: "insideLeft", fill: "currentColor", fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
              fontSize: "12px",
              padding: "10px 14px",
            }}
            formatter={formatTooltipValue}
            labelFormatter={(label) => `Time: ${label}`}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          {toolNames.map((name, index) => (
            <Bar
              key={name}
              dataKey={name}
              name={name}
              stackId="toolCalls"
              fill={TOOL_COLORS[index]}
              radius={index === toolNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={44}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

ToolCallMetrics.propTypes = {
  stats: PropTypes.shape({
    toolCallCount: PropTypes.number,
    toolCallRequests: PropTypes.number,
    byToolName: PropTypes.object,
    byAgentRequestType: PropTypes.object,
    toolCallTimeline: PropTypes.array,
  }).isRequired,
};
