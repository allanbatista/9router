# Logs de uso

## Responsabilidade

Expor os logs derivados de `usageHistory` no dashboard.

## Entidades

- [Input tokens chart](./INPUT_TOKENS_CHART.md): séries de tokens sem cache e em cache no dashboard.
- [Usage logs](./USAGE_LOGS.md): consulta e ordenação dos logs.

## Relações

`RequestLogger` chama `/api/usage/request-logs`, que consulta `usageHistory` por `getRecentLogs()`.

`InputTokensChart` chama `/api/usage/chart` e exibe `uncachedInputTokens` com `primary` e `cachedTokens` com `info`.

## Fontes no código

- `src/shared/components/RequestLogger.js`
- `src/app/api/usage/request-logs/route.js`
- `src/lib/db/repos/usageRepo.js`
