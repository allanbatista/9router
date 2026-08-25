# Request details

## Responsabilidade

Persistir metadados de requisições e fornecer consulta paginada para a observabilidade do dashboard.

## Entidades

- `requestDetails`: coleção MongoDB com `timestamp`, provider, model, status e payload estruturado.
- `RequestDetailsTab`: tabela, filtros, paginação e drawer de detalhes.
- `streamMetrics`: métricas de bytes/chunks do provider e cliente, término do upstream e tool-calls observadas.
- `requestType`: classificação canônica (`tool_call`, `agent` ou `chat`), com `agentRequestType`, nomes/quantidade de tools e identidade de sessão.

## Relações

`RequestDetailsTab` chama `/api/usage/request-details`, que usa `getRequestDetails()` e a tabela `requestDetails`.

## Fluxo

Filtros e tamanho de página são enviados à API. O repositório calcula total, aplica `LIMIT/OFFSET` e ordena timestamps por instante, preservando o ID como desempate. `sessionId` consulta as localizações legadas e normalizadas da sessão no MongoDB. A UI formata a data no fuso local em `pt-BR`, identifica `tool_call` na tabela, permite filtrar a sessão manualmente ou pelo drawer e oferece cópia dos payloads JSON.

No streaming, o registro inicial usa status `streaming`. A finalização é idempotente: EOF normal usa `success`, chamadas de ferramenta (tool-calls) concluídas e consumidas pelo cliente são registradas como `success`, cancelamento antecipado do consumidor sem tool-calls usa `aborted` com `termination: "client_closed"`, e falha de transporte usa `error`. Tool-calls são persistidas como metadados sem argumentos, permitindo diferenciar resposta parcial recebida de ausência de bytes.

O drawer mantém o header e as tabs fora do contêiner rolável; somente o corpo da tab tem scroll. `Agent & Config` é a primeira tab e apresenta o diagnóstico de lifecycle (`termination`, `reason`, bytes provider/cliente, EOF upstream e tool-calls), além de ações de cópia para diagnóstico, roteamento, conversa, metadados e payloads. Em `client_closed` com bytes dos dois lados e `upstreamEnded=false`, a causa provável é o consumidor/client fechar a conexão depois de receber uma resposta parcial; isso não é classificado como erro do provider.

`UsageStats` calcula `toolCallRequests`, `toolCallCount`, sucessos/abortos, nomes de tools e tipos de request a partir de uma projeção dos campos de classificação em `requestDetails`, evitando carregar payloads de conversa completos.

## Fontes no código

- `src/lib/db/repos/requestDetailsRepo.js`
- `src/lib/db/models/RequestDetail.js`
- `src/lib/db/connection.js`
- `src/app/api/usage/request-details/route.js`
- `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`
- `src/shared/components/Drawer.js`
- `src/shared/utils/requestClassification.js`
- `src/shared/components/Pagination.js`
- `open-sse/utils/uuid.js`: geração de IDs UUIDv7 para detalhes criados no streaming.
- `open-sse/handlers/chatCore/requestDetail.js`: preservação do body raw do client no campo `request`.
- `open-sse/utils/sessionManager.js`: prioridade de `_agent_metadata` como fallback do `prompt_cache_key`.
- `open-sse/handlers/chatCore/streamingHandler.js`: finalização e persistência do ciclo de vida do stream.
- `open-sse/utils/stream.js`: coleta de bytes/chunks/tool-calls e snapshot das métricas.
- `open-sse/utils/streamHandler.js`: contagem do transporte upstream e cancelamento downstream.
- `src/shared/hooks/useCopyToClipboard.js`: cópia dos payloads JSON.
- `src/app/(dashboard)/dashboard/usage/components/InputTokensChart.js`: barras empilhadas de input com/sem cache usando os grupos da tabela.
- `tests/unit/request-details-tab.test.js`
- `src/shared/utils/usageTokens.js`: normalização compartilhada de tokens de entrada, cache lido e cache criado.
- `tests/unit/stream-observability.test.js`: contratos de finalização e métricas de tool-call.
