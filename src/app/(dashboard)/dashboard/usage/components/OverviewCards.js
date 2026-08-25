"use client";

import PropTypes from "prop-types";
import Badge from "@/shared/components/Badge";
import Card from "@/shared/components/Card";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

export default function OverviewCards({ stats }) {
  const cacheRate = stats.totalPromptTokens > 0
    ? ((stats.totalCachedTokens / stats.totalPromptTokens) * 100).toFixed(1)
    : 0;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {/* Total Requests */}
      <Card className="flex min-w-0 flex-col justify-between p-4 bg-surface border border-border/80 shadow-sm hover:border-border transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Total Requests</span>
          <span className="p-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.04] text-text-muted material-symbols-outlined text-[18px]">
            receipt_long
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <span className="truncate text-2xl font-bold text-text-main font-mono tracking-tight">{fmt(stats.totalRequests)}</span>
          <Badge variant="primary" size="sm">{fmt(stats.toolCallRequests)} tool-calls</Badge>
        </div>
        <span className="mt-1 text-[10px] text-text-muted">{fmt(stats.toolCallCount)} calls · {fmt(stats.toolCallSuccessRequests)} completed</span>
      </Card>

      {/* Input Tokens */}
      <Card className="flex min-w-0 flex-col justify-between p-4 bg-surface border border-border/80 shadow-sm hover:border-border transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Input Tokens</span>
          <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 material-symbols-outlined text-[18px]">
            input
          </span>
        </div>
        <div className="mt-2">
          <span className="truncate text-2xl font-bold text-sky-600 dark:text-sky-400 font-mono tracking-tight">{fmt(stats.totalPromptTokens)}</span>
        </div>
      </Card>

      {/* Cached Tokens */}
      <Card className="flex min-w-0 flex-col justify-between p-4 bg-surface border border-border/80 shadow-sm hover:border-border transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Cached Tokens</span>
          <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 material-symbols-outlined text-[18px]">
            cached
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="truncate text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono tracking-tight">{fmt(stats.totalCachedTokens)}</span>
          {stats.totalPromptTokens > 0 && (
            <span className="text-xs font-semibold font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {cacheRate}%
            </span>
          )}
        </div>
      </Card>

      {/* Output Tokens */}
      <Card className="flex min-w-0 flex-col justify-between p-4 bg-surface border border-border/80 shadow-sm hover:border-border transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Output Tokens</span>
          <span className="p-1.5 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 material-symbols-outlined text-[18px]">
            output
          </span>
        </div>
        <div className="mt-2">
          <span className="truncate text-2xl font-bold text-violet-600 dark:text-violet-400 font-mono tracking-tight">{fmt(stats.totalCompletionTokens)}</span>
        </div>
      </Card>

      {/* Estimated Cost */}
      <Card className="flex min-w-0 flex-col justify-between p-4 bg-surface border border-border/80 shadow-sm hover:border-border transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Est. Cost</span>
          <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 material-symbols-outlined text-[18px]">
            attach_money
          </span>
        </div>
        <div className="mt-2 flex flex-col">
          <span className="truncate text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">~{fmtCost(stats.totalCost)}</span>
          <span className="text-[10px] text-text-muted">Estimated rate cost</span>
        </div>
      </Card>
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
