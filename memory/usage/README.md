# Logs de uso

## Responsabilidade

Expor os logs derivados de `usageHistory` no dashboard.

## Entidades

- [Usage logs](./USAGE_LOGS.md): consulta e ordenação dos logs.

## Relações

`RequestLogger` chama `/api/usage/request-logs`, que consulta `usageHistory` por `getRecentLogs()`.

## Fontes no código

- `src/shared/components/RequestLogger.js`
- `src/app/api/usage/request-logs/route.js`
- `src/lib/db/repos/usageRepo.js`
