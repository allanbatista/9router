# Input tokens chart

## Responsabilidade

Exibir a distribuição temporal dos input tokens entre tokens sem cache e tokens em cache, com custo e quantidade de requests sobrepostos em linhas.

## Entidades

- `uncachedInputTokens`: input tokens que não foram lidos do cache.
- `cachedTokens`: input tokens identificados como cacheados.
- `InputTokensChart`: componente visual do dashboard.
- `requests`: quantidade de requests no mesmo bucket temporal.

## Relações

`InputTokensChart` consome `/api/usage/chart`, que delega a `getChartData(period)`.

As séries usam o mesmo contrato visual da legenda: `primary` para `Without cache` e `info` para `Cached`.

## Fluxo

O componente busca os buckets do período selecionado, exibe as séries empilhadas e usa o nome declarado em cada `Bar` no tooltip. `UsageChart` também usa o campo `requests` no eixo Y secundário para a linha de volume.

## Fontes no código

- `src/app/(dashboard)/dashboard/usage/components/InputTokensChart.js`
- `src/app/api/usage/chart/route.js`
- `src/lib/db/repos/usageRepo.js`
- `src/app/(dashboard)/dashboard/usage/components/UsageChart.js`
