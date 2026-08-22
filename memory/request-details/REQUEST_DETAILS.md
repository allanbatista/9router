# Request details

## Responsabilidade

Persistir metadados de requisições e fornecer consulta paginada para a observabilidade do dashboard.

## Entidades

- `requestDetails`: tabela SQLite com `timestamp`, provider, model, status e payload serializado.
- `RequestDetailsTab`: tabela, filtros, paginação e drawer de detalhes.

## Relações

`RequestDetailsTab` chama `/api/usage/request-details`, que usa `getRequestDetails()` e a tabela `requestDetails`.

## Fluxo

Filtros e tamanho de página são enviados à API. O repositório calcula total, aplica `LIMIT/OFFSET` e ordena timestamps por instante, preservando o ID como desempate. A UI formata a data no fuso local em `pt-BR`, centraliza request ID/ck/session ID na primeira coluna, exibe o session raw enviado pelo cliente (incluindo `_agent_metadata.session-id`), resolve a conta priorizando o e-mail e oferece cópia dos payloads JSON no drawer.

## Fontes no código

- `src/lib/db/repos/requestDetailsRepo.js`
- `src/app/api/usage/request-details/route.js`
- `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`
- `src/shared/components/Pagination.js`
- `open-sse/utils/uuid.js`: geração de IDs UUIDv7 para detalhes criados no streaming.
- `open-sse/handlers/chatCore/requestDetail.js`: preservação do body raw do client no campo `request`.
- `open-sse/utils/sessionManager.js`: prioridade de `_agent_metadata` como fallback do `prompt_cache_key`.
- `src/shared/hooks/useCopyToClipboard.js`: cópia dos payloads JSON.
- `src/app/(dashboard)/dashboard/usage/components/InputTokensChart.js`: barras empilhadas de input com/sem cache usando os grupos da tabela.
- `tests/unit/request-details-tab.test.js`
- `src/shared/utils/usageTokens.js`: normalização compartilhada de tokens de entrada, cache lido e cache criado.
