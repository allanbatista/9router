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

A API valida paginação e filtros, o repositório ordena os registros pelo instante UTC equivalente e a UI apresenta os resultados em páginas. Streams são inseridos como `streaming` e finalizados como `success`, `aborted` (`client_closed`) ou `error`.

## Fontes no código

- `src/app/(dashboard)/dashboard/requests/page.js`
- `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`
- `src/app/api/usage/request-details/route.js`
- `src/lib/db/repos/requestDetailsRepo.js`
- `src/lib/db/schema.js`
- `open-sse/handlers/chatCore/streamingHandler.js`
- `open-sse/utils/stream.js`
- `open-sse/utils/streamHandler.js`
