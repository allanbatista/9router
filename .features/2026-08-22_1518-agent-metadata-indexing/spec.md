# Indexação Configurável de _agent_metadata no MongoDB com Filtros e Métricas

Status: ready
Created: 2026-08-22 15:18
Updated: 2026-08-22 15:25

## Objective

Permitir que o 9router extraia, normalize, armazene e indexe dinamicamente atributos informados no campo `_agent_metadata` das requisições (com configuração padrão para `os`, `hostname` e `agent-name`, permitindo adição e remoção pelo usuário). Habilitar filtragem e visualização detalhada desses metadados na listagem de requisições (`RequestDetailsTab`) e disponibilizar métricas agregadas agrupadas por metadados de agentes no dashboard de uso (`UsageStats`).

## Context

Clientes e ferramentas de linha de comando (como `pi`, `claude`, `cline`, `codex` e `openclaw`) enviam metadados operacionais no corpo da requisição através do atributo `_agent_metadata` (formato array de pares `[{ key: string, value: string }]`). Atualmente, o 9router apenas consome pontualmente o campo `session-id` do `_agent_metadata` para afinidade e rastreamento de sessão, descartando a capacidade de indexar, buscar, filtrar por máquina (`hostname`), sistema operacional (`os`) ou agente cliente (`agent-name`), ou de gerar métricas agregadas por essas dimensões operacionais.

O sistema utiliza MongoDB através de Mongoose, com persistência assíncrona em buffer para `requestDetails` e contadores atômicos em `usageDaily` / `usageHistory`. Configurações globais são mantidas em `settingsRepo` (`Setting` model) e expostas via `GET/PATCH /api/settings`.

## Discovery Ledger

| ID | Source | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| D1 | `src/lib/db/models/RequestDetail.js:5-27` | O schema `RequestDetailSchema` possui índices fixos em `timestamp`, `provider`, `model`, `connectionId`, mas não possui campo dedicado estruturado nem índices para metadados de agente. | `RequestDetailSchema.index({ provider: 1, timestamp: -1 })` | Necessário adicionar campo `agentMetadata` (`Mixed`/subdocumento) e índices dinâmicos ou específicos nos campos configurados. | confirmed |
| D2 | `src/lib/db/models/UsageHistory.js:5-26` & `UsageDaily.js:5-24` | `UsageDaily` acumula métricas atômicas apenas em `byProvider`, `byModel`, `byAccount`, `byApiKey`, `byEndpoint`. `UsageHistory` possui campo `meta` genérico. | `byProvider: { type: Schema.Types.Mixed, default: () => ({}) }` em `UsageDaily.js` | Adicionar suporte a agregações por dimensões de `agentMetadata` em `UsageDaily` (`byAgentMetadata`) para alimentar métricas do dashboard sem varredura pesada. | confirmed |
| D3 | `src/lib/db/repos/requestDetailsRepo.js:144-270` | `flushToDatabase` persiste `RequestDetail` extraindo campos do objeto `record`, e `getRequestDetails` aceita filtros estáticos (`provider`, `model`, `connectionId`, `status`, `startDate`, `endDate`). | `if (filter.provider) query.provider = filter.provider;` em `requestDetailsRepo.js:235` | Normalizar e salvar `agentMetadata` no documento e aceitar parâmetros de filtro dinâmicos por metadados (`agentMetadata.<key>` ou prefixos dedicados). | confirmed |
| D4 | `src/lib/db/repos/settingsRepo.js:7-64` | `DEFAULT_SETTINGS` define parâmetros globais (observabilidade, proxies, estratégias), sem chave para campos de metadados de agente configuráveis. | `enableObservability: false, observabilityMaxRecords: 1000...` em `settingsRepo.js:42-46` | Adicionar configuração `agentMetadataKeys` com default `["os", "hostname", "agent-name"]` persistida e retornada via settings. | confirmed |
| D5 | `open-sse/handlers/chatCore/requestDetail.js:17-80` | `extractRequestConfig` e `buildRequestDetail` constroem o payload do log de requisição, mantendo o body do cliente mas sem extrair `agentMetadata` normalizado para os registros de persistência. | `buildRequestDetail(base, overrides)` em `requestDetail.js:63-80` | Extrair array `_agent_metadata` da requisição e converter em objeto estruturado `{ [key]: value }` saneado antes do disparo para persistência. | confirmed |
| D6 | `open-sse/utils/sessionManager.js:148-150` & `src/app/api/usage/request-details/route.js:86-89` | Formato padrão observado no código atual para `_agent_metadata` é um array de objetos `{ key: string, value: any }`. | `const session = rq._agent_metadata.find((item) => item?.key === "session-id")?.value;` | A extração deve processar arrays `{ key, value }` de forma tolerante (suportando também objetos chave-valor planos se fornecidos). | confirmed |
| D7 | `src/app/api/usage/request-details/route.js:24-116` | A rota `/api/usage/request-details` aplica redação em `request`, `providerRequest`, `providerResponse` e `response` para evitar vazamento de conversas completas no dashboard, repassando apenas metadados. | `const redacted = { ...d, cacheKey, sessionId, conversationId, rawSessionId, errorLabel: getErrorLabel(d) };` | `agentMetadata` estruturado deve ser retornado no detalhe do request sem ser ocultado pela redação de conversas. | confirmed |
| D8 | `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js:217-482` | `RequestDetailsTab` implementa formulário de filtros (atualmente apenas Provider e Datas) e renderiza tabela de histórico de requisições e Drawer de detalhes. | `const [filters, setFilters] = useState({ provider: "", startDate: "", endDate: "" });` | Integrar campos de filtro de metadados (ex.: inputs/selects para OS, Hostname, Agent Name) e exibir badges/colunas de metadados na listagem e no Drawer. | confirmed |
| D9 | `src/shared/components/UsageStats.js:330-395` & `src/lib/db/repos/usageRepo.js:262-336` | `UsageStats` apresenta abas de métricas por Provider, Model, Account, API Key e Endpoint, agrupadas por `groupDataByKey` e `sortData`. | `case "model": ... case "account": ... case "apiKey": ...` em `UsageStats.js` | Adicionar suporte para visualização de métricas por dimensões de `_agent_metadata` configuradas (ex.: tokens e requisições por Agent Name, OS, Hostname). | confirmed |
| D10 | `src/app/(dashboard)/dashboard/profile/page.js:1616-1636` & `src/app/api/settings/route.js:17-114` | A página de configurações/perfil gerencia flags de observabilidade via `PATCH /api/settings`. | `<Toggle checked={observabilityEnabled} onChange={updateObservabilityEnabled} />` | Expor interface para inclusão/remoção das chaves permitidas em `agentMetadataKeys`. | confirmed |

## Intent Classification

- User intent: end-to-end feature
- Rationale: A solicitação abrange desde a recepção e extração de `_agent_metadata` nas requisições HTTP, persistência configurável e indexação no MongoDB, extensão de queries nas APIs de histórico/métricas, até a interface visual no dashboard (filtros na aba de requisições, métricas na aba de uso e configuração de chaves permitidas nas configurações).
- Coverage expectation: full end-to-end contract

## Actors and Flows

- Actors/systems affected:
  - Clientes API / Ferramentas CLI (ex.: `pi`, `claude`, `cline`, `codex`, `openclaw`): enviam requisições HTTP contendo o atributo `_agent_metadata` no corpo JSON.
  - Runtime Open-SSE / Chat Core (`open-sse/handlers/chatCore.js` e sub-handlers): intercepta requisições, normaliza `_agent_metadata` e despacha para armazenamento e agregação de uso.
  - Repositório de Dados MongoDB (`requestDetailsRepo`, `usageRepo`, `settingsRepo`): persiste detalhes de requisições com campos indexados de metadados e atualiza agregados em `usageDaily`.
  - Usuário do Dashboard / Administrador: configura quais chaves de metadados são ativas para indexação/métricas, aplica filtros por metadados na visualização de requisições e analisa dashboards de consumo por agente/máquina/SO.

- Current flow:
  1. Cliente envia requisição POST para endpoints de chat com `_agent_metadata: [{ key: "os", value: "linux" }, ...]`.
  2. `sessionManager` inspeciona apenas `session-id` dentro de `_agent_metadata` (D6).
  3. `chatCore` salva o corpo bruto dentro de `RequestDetail.data.request` (D5).
  4. Quando observabilidade está ativa, `requestDetailsRepo` salva o documento no MongoDB sem campos indexados de metadados de agente (D1, D3).
  5. `usageRepo.saveRequestUsage` acumula métricas apenas por provider, model, account, apiKey e endpoint (D2).
  6. Usuário acessa `/dashboard/requests` (`RequestDetailsTab`) e consegue filtrar apenas por Provider, Data Inicial e Data Final (D8).
  7. Usuário acessa `/dashboard/usage` (`UsageStats`) e visualiza métricas agregadas apenas por Provider, Model, Account, API Key e Endpoint (D9).

- Target flow:
  1. Administrador configura em `/api/settings` a lista `agentMetadataKeys` (padrão: `["os", "hostname", "agent-name"]`), permitindo adicionar ou remover chaves suportadas (D4, D10).
  2. Cliente envia requisição com `_agent_metadata`.
  3. O sistema extrai e normaliza os pares chave-valor para um mapa plano `agentMetadata: { "os": "linux", "hostname": "...", "agent-name": "pi", ... }`, saneando chaves contra caracteres reservados de operadores de banco (D5, D6).
  4. `requestDetailsRepo` armazena `agentMetadata` como campo de primeiro nível estruturado em `RequestDetail` e o MongoDB indexa as chaves configuradas (D1, D3).
  5. `usageRepo` contabiliza requisições, tokens e custos em `usageDaily.byAgentMetadata.<key>.<value>` para cada chave configurada (D2).
  6. Na listagem de requisições (`/dashboard/requests`), o usuário pode filtrar por qualquer uma das chaves configuradas (ex.: `os=linux`, `agent-name=pi`, `hostname=workstation`), e a tabela exibe badges dos metadados e detalhes completos no Drawer (D7, D8).
  7. No dashboard de uso (`/dashboard/usage`), o usuário visualiza métricas e gráficos agrupados pelas dimensões de metadados de agentes ativas (D9).

## Scope

- Inclusão da configuração `agentMetadataKeys` em `settingsRepo` e schema `Setting` com valor padrão `["os", "hostname", "agent-name"]`.
- Suporte a atualização e leitura de `agentMetadataKeys` via `GET /api/settings` e `PATCH /api/settings`.
- Extração e normalização de `_agent_metadata` (suportando formato array `[{ key, value }]` e objeto plano) no pipeline de requisições de chat (`chatCore` / `requestDetail`).
- Atualização do schema e repositório `RequestDetail` para persistir o campo `agentMetadata` e garantir índices no MongoDB para as chaves configuradas.
- Atualização da rota `GET /api/usage/request-details` e do repositório `requestDetailsRepo.getRequestDetails` para suportar filtros por metadados de agentes (ex.: `agentMetadata.<key>=<value>` ou parâmetros diretos de metadados).
- Atualização da rota `GET /api/usage/request-details/[id]` e da redação de payloads para expor `agentMetadata` de forma transparente no detalhe da requisição.
- Atualização de `usageRepo.saveRequestUsage` e `UsageDaily` para registrar contadores atômicos (requests, tokens, cost) agrupados por chaves de metadados configuradas.
- Atualização de `GET /api/usage/stats` para retornar as métricas agregadas de `agentMetadata`.
- Endpoint ou método para listar valores distintos de metadados para popular filtros dinâmicos na interface (`GET /api/usage/metadata-values` ou via parâmetros em rotas existentes).
- Atualização de `RequestDetailsTab.js` com controles de filtro por metadados configurados, exibição de tags na listagem e visualização de metadados completos no Drawer de detalhes.
- Atualização de `UsageStats.js` para disponibilizar visualização e tabela de métricas agrupadas pelas dimensões de agentes.
- Interface de configuração das chaves de metadados permitidas em `dashboard/profile` (ou aba de configurações de observabilidade).

## Scope Size Estimate

- New surfaces beyond the literal request: 0 (nenhuma nova rota não solicitada; expansão estritamente alinhada com persistência, APIs de estatísticas/detalhes e componentes do dashboard solicitados pelo usuário).
- Estimated files: product: 9, tests: 4, docs/CI: 1
- Estimated lines: product: ~450, tests: ~300
- Vs literal request: same magnitude
- User confirmed expansion: not-required — no expansion beyond the literal request

## Out of Scope

- Modificação do protocolo de comunicação dos clientes CLI ou injeção forçada de `_agent_metadata` em requisições que não o possuam.
- Criação de mecanismos externos de telemetria ou brokers de mensageria adicionais (ex.: Kafka, Prometheus, OpenTelemetry Collector).
- Alteração no comportamento de roteamento de modelos ou estratégias de fallback baseadas em metadados de agente (fora da indexação/métricas/filtros).
- Indexação ilimitada e sem controle de chaves arbitrárias de alta cardinalidade sem estarem cadastradas na configuração permitida.

## Questions and Decisions

- [C1] Q: Qual deve ser o formato canônico de armazenamento de `agentMetadata` nos documentos MongoDB?
  A: Objeto dicionário plano com chaves string normalizadas (kebab-case/lowercase) e valores em string/primitivo saneados (ex.: `{ "os": "linux", "hostname": "allanbatista-workstation", "agent-name": "pi" }`), facilitando buscas diretas via dot notation `agentMetadata.<key>` e índices compostos `{ "agentMetadata.<key>": 1, timestamp: -1 }`. — origin: recorded decision (baseada em D1, D3, D6)
- [C2] Q: Como lidar com requisições legadas ou que não contêm o campo `_agent_metadata`?
  A: Requisições sem `_agent_metadata` terão `agentMetadata: {}` (ou campos omitidos), não sendo impactadas na gravação e sendo filtradas normalmente em consultas que não exijam metadados. — origin: explicit assumption (não altera escopo nem contrato de clientes)
- [C3] Q: Quais são as chaves padrão ativadas para indexação e métricas caso o usuário não configure nenhuma lista?
  A: As chaves padrão são `["os", "hostname", "agent-name"]`, conforme solicitado literalmente na instrução do usuário. — origin: user (user-instructions.md)
- [C4] Q: Como garantir segurança contra operadores MongoDB maliciosos nas chaves de metadados enviadas por clientes?
  A: Chaves de metadados são saneadas rejeitando ou removendo prefixos que iniciem com `$` ou contenham caracteres inválidos para campos Mongoose, além de limitar a extração apenas para valores escalares (strings, números, booleanos). — origin: recorded decision

## Requirements Traceability

| Need | Requirement (EARS) | Acceptance criterion (Given/When/Then) | Validation surface | Basis | Status |
|---|---|---|---|---|---|
| Configuração de Chaves | The system must persist a configurable list of active metadata keys (`agentMetadataKeys`) in settings, defaulting to `["os", "hostname", "agent-name"]`. | Given the system starts with default settings, When settings are fetched, Then `agentMetadataKeys` contains `["os", "hostname", "agent-name"]`. | backend/API | D4, D10 | defined |
| Atualização de Configuração | When an authorized user updates `agentMetadataKeys` via `PATCH /api/settings`, the system must validate, persist and return the updated keys list. | Given an authenticated request to `PATCH /api/settings` with `agentMetadataKeys: ["os", "hostname", "agent-name", "mode"]`, When the request is processed, Then the settings are updated and returned with the new list. | API | D4, D10 | defined |
| Extração e Normalização | When a chat request payload contains `_agent_metadata`, the system must extract and normalize configured and present keys into a sanitized `agentMetadata` key-value dictionary. | Given an incoming request body containing `_agent_metadata` array with `os`, `hostname` and `agent-name`, When `buildRequestDetail` and `saveRequestUsage` process the request, Then `agentMetadata` contains `{ os: "linux", hostname: "allanbatista-workstation", "agent-name": "pi" }`. | backend | D5, D6 | defined |
| Persistência e Indexação em RequestDetail | While observability is enabled, the system must persist `agentMetadata` on `RequestDetail` documents and maintain MongoDB indexes for configured metadata keys. | Given a request detail with `agentMetadata`, When saved via `saveRequestDetail`, Then the document in collection `requestDetails` contains `agentMetadata` and query on `agentMetadata.<key>` uses the index. | backend/database | D1, D3 | defined |
| Agregação de Métricas em UsageDaily | When request usage is recorded with `agentMetadata`, the system must atomically increment counters (requests, tokens, cost) in `UsageDaily` under `byAgentMetadata` for all configured keys present. | Given a processed request with `tokens` and `agentMetadata` containing `agent-name: "pi"`, When `saveRequestUsage` executes, Then `UsageDaily` increments requests, tokens and cost under `byAgentMetadata.agent-name.pi`. | backend/database | D2, D9 | defined |
| Filtro de Requisições por Metadados | When `GET /api/usage/request-details` receives metadata filter query parameters, the system must return only matching request details. | Given multiple request details stored with different `agent-name` values, When `GET /api/usage/request-details?agentMetadata.agent-name=pi` is requested, Then only records with `agent-name: "pi"` are returned. | API | D3, D7 | defined |
| Exposição Transparente sem Redação Excessiva | When `GET /api/usage/request-details` returns redacted details, the system must include the unredacted `agentMetadata` object in each detail item. | Given a stored request detail with `agentMetadata` and message payloads, When details list is retrieved, Then conversation text is redacted but `agentMetadata` is preserved intact. | API | D7 | defined |
| Visualização e Filtro no Dashboard de Requisições | Where metadata keys are configured, the system must render filter selectors for active metadata keys and display metadata badges and details in `RequestDetailsTab`. | Given active metadata keys `["os", "hostname", "agent-name"]`, When the user opens the Requests page, Then filter controls for metadata keys are available and table rows display the metadata attributes. | frontend/browser | D8 | defined |
| Dashboard de Métricas por Metadados | Where `UsageStats` displays aggregate usage, the system must allow viewing usage tables and charts grouped by active agent metadata dimensions. | Given aggregated usage data in `byAgentMetadata`, When the user views the Usage dashboard by Agent dimension, Then requests, prompt tokens, completion tokens, cached tokens and cost are tabulated by metadata value. | frontend/browser | D9 | defined |
| Gestão de Metadados nas Configurações | Where the user accesses dashboard settings, the system must provide an interface to add, remove and view configured `agentMetadataKeys`. | Given the settings profile page, When the user adds a new key `mode` to `agentMetadataKeys`, Then the setting is saved and becomes active for indexing and filtering. | frontend/browser | D10 | defined |

## Contract and Persistence

- Changed contracts:
  - `GET /api/settings` & `PATCH /api/settings`:
    - Response & Request Body: includes `agentMetadataKeys: string[]`.
  - `GET /api/usage/request-details`:
    - Query params: supports `agentMetadata.<key>=<value>` (ou `metadata_<key>=<value>`), além dos existentes `provider`, `model`, `connectionId`, `status`, `startDate`, `endDate`.
    - Item response: includes `agentMetadata: Record<string, string | number | boolean>`.
  - `GET /api/usage/stats`:
    - Response JSON: includes `byAgentMetadata: Record<string, Record<string, { requests: number, promptTokens: number, completionTokens: number, cachedTokens: number, cost: number }>>`.
  - `GET /api/usage/metadata-values?key=<key>` (ou query param em `GET /api/usage/request-details/filters`):
    - Retorna lista de valores distintos para a chave informada: `{ values: string[] }`.
- Persistence:
  - MongoDB `settings` collection (`Setting` model): campo `agentMetadataKeys` (`[String]`, default: `["os", "hostname", "agent-name"]`).
  - MongoDB `requestDetails` collection (`RequestDetail` model): campo `agentMetadata` (`Mixed`/subdocument), com índices `{ "agentMetadata.<key>": 1, timestamp: -1 }`.
  - MongoDB `usageDaily` collection (`UsageDaily` model): campo `byAgentMetadata` (`Mixed`) com sub-objetos agrupados por `chave.valor`.
  - MongoDB `usageHistory` collection (`UsageHistory` model): campo `agentMetadata` (`Mixed`).
- Validation surfaces:
  - Backend/API: testes de integração e unitários para `settingsRepo`, `requestDetailsRepo`, `usageRepo`, rotas `/api/settings`, `/api/usage/request-details`, `/api/usage/stats`.
  - Frontend/UI: renderização e interação em `RequestDetailsTab.js`, `UsageStats.js` e página de configurações/perfil.
- Ambiguities: none

## Shared Contract

- Status: closed
- Payloads/fields:
  - Setting update payload: `{ agentMetadataKeys: string[] }`.
  - Normalized `agentMetadata` object in request details: `{ [key: string]: string | number | boolean }`.
  - Request details filter params: `?page=1&pageSize=20&provider=&model=&agentMetadata[os]=linux&agentMetadata[agent-name]=pi`.
  - Request detail item: `{ id, timestamp, provider, model, status, tokens, latency, agentMetadata: { os: "linux", hostname: "allanbatista-workstation", "agent-name": "pi" }, errorLabel }`.
  - Usage stats `byAgentMetadata` item: `{ [dimensionKey: string]: { [dimensionValue: string]: { requests: number, promptTokens: number, completionTokens: number, cachedTokens: number, cost: number } } }`.
- States and errors:
  - HTTP 400 em `PATCH /api/settings` caso `agentMetadataKeys` não seja um array de strings válidas.
  - HTTP 200 em `GET /api/usage/request-details` retornando `{ details: [...], pagination: { ... } }`.
- Minimum sequence:
  1. Frontend requisita `GET /api/settings` para descobrir as chaves ativas de metadados (`agentMetadataKeys`).
  2. Frontend requisita `GET /api/usage/request-details` incluindo filtros de metadados selecionados.
  3. Frontend requisita `GET /api/usage/stats` para obter as métricas acumuladas (incluindo `byAgentMetadata`).
- Basis: D1, D2, D3, D4, D7, D8, D9, D10

## Acceptance Criteria

- Given a system configured with default `agentMetadataKeys: ["os", "hostname", "agent-name"]`, When a request with `_agent_metadata` arrives, Then the extracted metadata fields are stored in `RequestDetail.agentMetadata` and indexed in MongoDB.
- Given an authenticated request to `PATCH /api/settings` with `{ agentMetadataKeys: ["os", "hostname", "agent-name", "tz"] }`, When processed, Then the settings persist the new key list and return HTTP 200 with the updated keys.
- Given request details with diverse OS and agent names stored in MongoDB, When `GET /api/usage/request-details?agentMetadata.os=linux` is invoked, Then only records matching `os == "linux"` are returned in `details`.
- Given a request detail returned via `GET /api/usage/request-details`, When inspection occurs, Then conversation messages are redacted but `agentMetadata` is present with its original key-values.
- Given requests recorded with `agent-name: "pi"`, When `GET /api/usage/stats` is called, Then `byAgentMetadata["agent-name"]["pi"]` contains the correct aggregated count of requests, tokens, and calculated cost.
- Given the `RequestDetailsTab` UI component, When metadata filters are configured, Then input/selector elements for the active metadata keys are rendered, allowing the user to filter the list by specific agent, OS, or hostname values.
- Given the `UsageStats` UI component, When the user selects an agent metadata dimension, Then a breakdown table displays the total requests, tokens (in, out, cached), and cost grouped by each metadata value.
- Given the profile settings page, When a user adds a new metadata key and clicks save, Then the list of indexed metadata keys is updated and reflected across filters.

## Clarifications Needed

> none = nothing blocks `ready`. Max 5 high-impact items, prioritized by (Impact × Uncertainty). Trivial doubts don't belong here: they become explicit assumptions in `Questions and Decisions` or `Out of Scope`.

none

## Spec Readiness Gates

- [x] `AGENTS.md` and cited sources were read.
- [x] Every requirement is in EARS form and references a Discovery finding (`D#`) or a recorded decision.
- [x] Every acceptance criterion is in Given/When/Then with a validation surface.
- [x] Every requirement passed the Minimalism Gate: literal request, fundamental and aligned with the client's requested functionality/result, removal/simplification review, and lowest complexity meeting acceptance; the rest is in `Out of Scope`.
- [x] `Scope Size Estimate` filled; every expansion beyond the literal request is confirmed by the user (`Questions and Decisions`, origin: user) or recorded in `Clarifications Needed` — guardian approval alone never closes an expansion.
- [x] `Clarifications Needed` = none, or `Status: blocked`.
- [x] `plan.md` can be written with no pending product decision.
- [x] `Shared Contract` = `closed` or `none` before the parallel spawn `batista-ux`∥`batista-arch`.

## Definition of Done

- [ ] Complete product result.
- [ ] Discovery and traceability support scope and acceptance criteria.
- [ ] Changed public/internal contracts are listed.
- [ ] Practical validation with real evidence or exact blocker recorded.
- [ ] Needed automated tests are split between task focus and final phase gate.
- [ ] Required real evidence for frontend/backend/job/infra is defined.
- [x] Guardian approved the spec.
