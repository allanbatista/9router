# Usage logs

## Responsabilidade

Retornar os logs mais recentes primeiro, independentemente do formato de timezone do timestamp.

## Entidades

- `usageHistory`: tabela SQLite com timestamp e sequência de inserção.
- `getRecentLogs()`: consulta limitada para o dashboard.

## Relações

`getRecentLogs()` alimenta `RequestLogger` através das rotas `/api/usage/request-logs` e `/api/usage/logs`.

## Fluxo

A consulta ordena pelo instante convertido com `julianday(timestamp)` em ordem decrescente; `timestamp` e `id` resolvem empates.

`Recent Requests` exibe input, output e cached tokens; o cache é lido também da estrutura aninhada `prompt_tokens_details` antes da persistência.

A persistência dos detalhes respeita `enableObservability` e mantém compatibilidade com instalações antigas que salvaram `observabilityEnabled`.

Falhas de provider persistem `providerResponse.status/body` e expõem `errorLabel` na listagem. O fallback de account ocorre no handler de chat: após marcar a account indisponível, a próxima account elegível é tentada.

Erros `400` sem indicação textual de quota/rate-limit não trocam de account, pois normalmente representam payload ou tradução inválida e não falha específica da credencial.

## Fontes no código

- `src/lib/db/repos/usageRepo.js`
- `src/shared/components/RequestLogger.js`
- `src/app/api/usage/request-logs/route.js`
