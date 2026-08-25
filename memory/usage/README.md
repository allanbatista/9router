# Logs de uso

## Responsabilidade

Expor os logs derivados de `usageHistory` no dashboard.

## Entidades

- [Input tokens chart](./INPUT_TOKENS_CHART.md): séries de tokens sem cache e em cache no dashboard.
- [Usage logs](./USAGE_LOGS.md): consulta e ordenação dos logs.

## Relações

`RequestLogger` chama `/api/usage/request-logs`, que consulta `usageHistory` por `getRecentLogs()`.

`InputTokensChart` chama `/api/usage/chart` e exibe `uncachedInputTokens` com `primary` e `cachedTokens` com `info`.

`UsageStats` inicia em `24h` e exibe métricas de tool-call por nome e tipo de request; `/api/usage/stats` e `/api/usage/chart` usam `24h` quando o período não é informado.

`UsageChart` combina barras de input cacheado/não cacheado com linhas de custo e quantidade de requests em eixo Y secundário. `ToolCallMetrics` fica no final do Usage & Analytics e usa barras verticais empilhadas por hora, segmentadas por nome da tool; o tooltip preserva o nome da série. O card de Total Requests exibe tool-calls em badge.

## Fontes no código

- `src/shared/components/RequestLogger.js`
- `src/app/api/usage/request-logs/route.js`
- `src/lib/db/repos/usageRepo.js`
- `src/shared/components/UsageStats.js`
- `src/app/(dashboard)/dashboard/usage/components/OverviewCards.js`
- `src/app/api/usage/stats/route.js`
- `src/app/api/usage/chart/route.js`
- `src/app/(dashboard)/dashboard/usage/components/UsageChart.js`
- `src/app/(dashboard)/dashboard/usage/components/ToolCallMetrics.js`
