# Requisições do dashboard

## Responsabilidade

Listar, filtrar, paginar e consultar os detalhes das requisições roteadas.

## Entidades

- [Request details](./REQUEST_DETAILS.md): persistência e tela de observabilidade.

## Relações

```mermaid
flowchart LR
  UI[RequestDetailsTab] --> API[/api/usage/request-details]
  API --> REPO[requestDetailsRepo]
  REPO --> DB[(requestDetails)]
  STREAM[streamingHandler/streamHandler] --> REPO
```

## Fluxo

A API valida paginação e filtros, o repositório ordena os registros pelo instante UTC equivalente e a UI apresenta os resultados em páginas. Streams são inseridos como `streaming` e finalizados como `success` (incluindo tool-calls emitidas), `aborted` (`client_closed` sem tool-call) ou `error`. Registros legados com `client_closed` e tool-call parcial são apresentados como `success` pela UI.

## Fontes no código

- `src/app/(dashboard)/dashboard/requests/page.js`
- `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`
- `src/app/api/usage/request-details/route.js`
- `src/lib/db/repos/requestDetailsRepo.js`
- `src/lib/db/models/RequestDetail.js`
- `src/lib/db/connection.js`
- `open-sse/handlers/chatCore/streamingHandler.js`
- `open-sse/utils/stream.js`
- `open-sse/utils/streamHandler.js`
