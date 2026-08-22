# Request details

## Responsabilidade

Persistir metadados de requisições e fornecer consulta paginada para a observabilidade do dashboard.

## Entidades

- `requestDetails`: tabela SQLite com `timestamp`, provider, model, status e payload serializado.
- `RequestDetailsTab`: tabela, filtros, paginação e drawer de detalhes.

## Relações

`RequestDetailsTab` chama `/api/usage/request-details`, que usa `getRequestDetails()` e a tabela `requestDetails`.

## Fluxo

Filtros e tamanho de página são enviados à API. O repositório calcula total, aplica `LIMIT/OFFSET` e ordena timestamps por instante, preservando o ID como desempate. A UI formata a data no fuso local em `pt-BR`, centraliza request ID/ck/session ID na primeira coluna, exibe o session raw enviado pelo cliente e resolve a conta priorizando o e-mail.

## Fontes no código

- `src/lib/db/repos/requestDetailsRepo.js`
- `src/app/api/usage/request-details/route.js`
- `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`
- `src/shared/components/Pagination.js`
- `open-sse/utils/uuid.js`: geração de IDs UUIDv7 para detalhes criados no streaming.
- `open-sse/handlers/chatCore/requestDetail.js`: preservação do body raw do client no campo `request`.
- `tests/unit/request-details-tab.test.js`
- `src/shared/utils/usageTokens.js`: normalização compartilhada de tokens de entrada, cache lido e cache criado.
