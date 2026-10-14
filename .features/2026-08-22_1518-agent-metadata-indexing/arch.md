# Indexação e Filtros por _agent_metadata — Architecture

Status: ready
Spec: ./spec.md
Created: 2026-08-22 15:30
Updated: 2026-08-22 15:30

## Applicability

- Backend affected: yes — evidence: spec Validation surfaces cover `RequestDetail` and `UsageDaily`/`UsageHistory` schemas, `settingsRepo`, `requestDetailsRepo`, `usageRepo`, chat request interception pipeline (`chatCore`/`requestDetail`), and API endpoints (`GET/PATCH /api/settings`, `GET /api/usage/request-details`, `GET /api/usage/stats`, `GET /api/usage/metadata-values`).

## Architecture Ledger

| ID | Source | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| A1 | `src/lib/db/models/RequestDetail.js:5-27` | O schema Mongoose indexa `timestamp`, `provider`, `model`, `connectionId` e armazena payload em `data`, sem campo estruturado `agentMetadata` no documento raiz nem índices dedicados. | `RequestDetailSchema.index({ provider: 1, timestamp: -1 })` | Adicionar campo `agentMetadata` tipado como `Mixed` com subdocumento normalizado, índice wildcard `{ "agentMetadata.$**": 1 }` e índices compostos nos campos default (`agent-name`, `os`, `hostname`). | confirmed |
| A2 | `src/lib/db/models/UsageDaily.js:5-24` & `UsageHistory.js:5-26` | `UsageDaily` agrega contadores em `byProvider`, `byModel`, `byAccount`, `byApiKey`, `byEndpoint` via `$inc`. `UsageHistory` possui campo `meta` genérico. | `byProvider: { type: Schema.Types.Mixed, default: () => ({}) }` em `UsageDaily.js` | Adicionar campo `byAgentMetadata` em `UsageDaily` para atomic increments (`$inc`) em `{ byAgentMetadata: { [dimension]: { [value]: { requests, promptTokens, completionTokens, cachedTokens, cost } } } }` e campo `agentMetadata` em `UsageHistory`. | confirmed |
| A3 | `src/lib/db/repos/settingsRepo.js:7-64` | `DEFAULT_SETTINGS` gerencia flags e limites de observabilidade e modelos, sem configuração persistida para chaves ativas de metadados. | `DEFAULT_SETTINGS = { ... enableObservability: false, observabilityMaxRecords: 1000 ... }` | Adicionar `agentMetadataKeys: ["os", "hostname", "agent-name"]` em `DEFAULT_SETTINGS`, persistido no documento `global` da collection `settings`. | confirmed |
| A4 | `open-sse/handlers/chatCore/requestDetail.js:17-80` & `open-sse/handlers/chatCore.js:360-435` | `extractRequestConfig` e `buildRequestDetail` montam o registro para observabilidade a partir do corpo bruto da requisição, mas não isolam nem saneiam `agentMetadata`. | `buildRequestDetail(base, overrides)` em `requestDetail.js:63-80` | Criar helper de normalização `normalizeAgentMetadata` que converte array `[{ key, value }]` e objetos chave-valor em mapa plano `{ [key]: string | number | boolean }`, saneando operadores MongoDB (`$`, `.`). | confirmed |
| A5 | `src/lib/db/repos/requestDetailsRepo.js:144-270` | `flushToDatabase` insere documentos em batch usando `bulkWrite`, e `getRequestDetails` filtra por campos estáticos (`provider`, `model`, `connectionId`, `status`, `timestamp`). | `if (filter.provider) query.provider = filter.provider;` em `requestDetailsRepo.js:235` | Atualizar `flushToDatabase` para propagar `agentMetadata` e `getRequestDetails` para montar queries dinâmicas com dot notation `agentMetadata.<key>`. | confirmed |
| A6 | `src/app/api/usage/request-details/route.js:24-116` | A rota extrai query params e aplica sanitização/redação sobre `request`, `providerRequest`, `providerResponse` e `response`. | `const redacted = { ...d, cacheKey, sessionId, conversationId, rawSessionId, errorLabel: getErrorLabel(d) };` | Repassar `agentMetadata` intacto no objeto retornado para cada detalhe, permitindo que a tabela e filtros do dashboard o consumam sem expor conteúdo sensível de mensagens. | confirmed |
| A7 | `src/lib/db/repos/usageRepo.js:212-349` & `usageRepo.js:389-764` | `saveRequestUsage` executa `$inc` atômico em `UsageDaily` e `getUsageStats` consolida os totais por dimensão. | `incUpdates['byProvider.' + entry.provider + '.requests'] = 1` | Expandir `saveRequestUsage` para iterar sobre `agentMetadata` e alimentar `byAgentMetadata.<dimension>.<sanitizedValue>`, e estender `getUsageStats` para consolidar `byAgentMetadata` no output de métricas. | confirmed |
| A8 | `src/app/api/usage/metadata-values/route.js` | Não existe endpoint dedicado para obter a lista de valores distintos para uma chave de metadados para autopreenchimento de filtros. | Inexistente no codebase | Criar rota `GET /api/usage/metadata-values?key=<key>` usando `RequestDetail.distinct("agentMetadata.<key>")` para prover valores rápidos na interface. | confirmed |

## Approach (ADR-lite)

- Chosen: **Ingestão Normalizada com Índices Híbridos (Compostos para Padrões + Wildcard para Customizados) e Agregação Atômica em `UsageDaily`**.
  - No pipeline de entrada (`chatCore`/`requestDetail`), o payload `_agent_metadata` é extraído e saneado para um objeto plano `agentMetadata: Record<string, string | number | boolean>` livre de chaves proibidas (`$` e `.`).
  - No MongoDB (`RequestDetail`), o campo `agentMetadata` é persistido no nível raiz do documento com índices compostos de alta performance `{ "agentMetadata.agent-name": 1, timestamp: -1 }`, `{ "agentMetadata.os": 1, timestamp: -1 }`, `{ "agentMetadata.hostname": 1, timestamp: -1 }` e um índice wildcard `{ "agentMetadata.$**": 1 }` para suportar chaves arbitrárias adicionadas pelo usuário.
  - No `UsageDaily`, contadores de requests, tokens (prompt, completion, cached) e custo são incrementados atomicamente via `$inc` em `byAgentMetadata.<key>.<escapedValue>` durante o registro de uso, garantindo que o dashboard de métricas leia resumos diários pré-agregados em $O(1)$ sem varreduras pesadas em coleções de log.
- Alternatives:
  - *Alternative A: Armazenar apenas JSON bruto dentro de `data.request` e indexar sob demanda com agregação em tempo de consulta (Scan sob demanda)*. Rejeitado: Inviabiliza paginação rápida no histórico de requisições com volume alto (>100k registros) e geraria latência excessiva no dashboard de métricas ao calcular agregação em tempo real.
  - *Alternative B: Criar uma coleção relacional/normalizada separada `AgentMetadataEntries` com chave estrangeira para cada requisição*. Rejeitado: Cria overhead desnecessário de escrita em batch no MongoDB (dois `bulkWrite` por request), complica limpeza e TTL de registros antigos (`observabilityMaxRecords`), além de violar o princípio de minimalismo.
- Rationale: A abordagem escolhida combina o melhor desempenho de escrita assíncrona já estabelecido no 9router com leitura indexada de alta eficiência, aproveitando a estrutura atômica de `UsageDaily` para métricas instantâneas e os índices MongoDB para filtros flexíveis na listagem.
- Tradeoffs: Nomes de valores contendo caracteres especiais ou pontos (`.`) necessitam de escape seguro de chave no subdocumento do `UsageDaily` (`.` substituído por `_` ou codificado) para evitar aninhamento indesejado no operador `$inc`.

## Component Boundaries

- `open-sse/utils/agentMetadata.js` (Novo Helper Utilitário):
  - Responsabilidade: Normalizar e sanear `_agent_metadata` (suportando array `[{ key, value }]` e objeto plano `{ key: value }`), remover prefixos `$` e caracteres `.`, limitar tipos a primitivos escalares (`string`, `number`, `boolean`) com truncamento seguro de tamanho (máx 256 caracteres por valor).
- `open-sse/handlers/chatCore/requestDetail.js` & `chatCore.js`:
  - Responsabilidade: Extrair `agentMetadata` do corpo da requisição e repassá-lo a `buildRequestDetail` e `saveUsageStats`.
- `src/lib/db/models/RequestDetail.js`:
  - Responsabilidade: Definir schema Mongoose com campo `agentMetadata: Schema.Types.Mixed`, índices compostos nos defaults e índice wildcard.
- `src/lib/db/models/UsageDaily.js` & `UsageHistory.js`:
  - Responsabilidade: Schema com campo `byAgentMetadata: Schema.Types.Mixed` em `UsageDaily` e `agentMetadata: Schema.Types.Mixed` em `UsageHistory`.
- `src/lib/db/repos/settingsRepo.js`:
  - Responsabilidade: Manter `agentMetadataKeys` com default `["os", "hostname", "agent-name"]` em `DEFAULT_SETTINGS` e permitir merge/update seguro.
- `src/lib/db/repos/requestDetailsRepo.js`:
  - Responsabilidade: Persistir `agentMetadata` via `bulkWrite` em `flushToDatabase`, transformar documento em `docToDetail` e aplicar filtros dinâmicos `agentMetadata.<key>` em `getRequestDetails`.
- `src/lib/db/repos/usageRepo.js`:
  - Responsabilidade: Incrementar contadores em `byAgentMetadata` em `saveRequestUsage` e tabular métricas em `getUsageStats`.
- `src/app/api/usage/request-details/route.js` & `src/app/api/usage/metadata-values/route.js`:
  - Responsabilidade: Parse de query parameters de metadados, redação segura mantendo `agentMetadata`, e endpoint de valores distintos.

## Data Model

### 1. `RequestDetail` (`requestDetails` collection)
```javascript
{
  _id: String, // ObjectId hex
  timestamp: Date, // index: true
  provider: String, // index: true
  model: String, // index: true
  connectionId: String, // index: true
  status: String,
  agentMetadata: {
    "os": String, // ex: "linux"
    "hostname": String, // ex: "workstation-01"
    "agent-name": String, // ex: "pi"
    [key: string]: String | Number | Boolean
  },
  data: {
    id: String,
    timestamp: String,
    provider: String,
    model: String,
    connectionId: String,
    status: String,
    latency: { ttft: Number, total: Number },
    tokens: { prompt_tokens: Number, completion_tokens: Number, cached_tokens: Number },
    agentMetadata: Object,
    request: Object,
    providerRequest: Object,
    providerResponse: Object,
    response: Object,
    error: Object | String,
    pxpipe: Object
  }
}
```
**Indexes**:
- `{ timestamp: -1 }`
- `{ provider: 1, timestamp: -1 }`
- `{ model: 1, timestamp: -1 }`
- `{ connectionId: 1, timestamp: -1 }`
- `{ "agentMetadata.agent-name": 1, timestamp: -1 }` (Composto Default)
- `{ "agentMetadata.os": 1, timestamp: -1 }` (Composto Default)
- `{ "agentMetadata.hostname": 1, timestamp: -1 }` (Composto Default)
- `{ "agentMetadata.$**": 1 }` (Wildcard Index para chaves dinâmicas configuradas)

### 2. `UsageDaily` (`usageDaily` collection)
```javascript
{
  dateKey: String, // "YYYY-MM-DD", unique: true
  requests: Number,
  promptTokens: Number,
  completionTokens: Number,
  cachedTokens: Number,
  cost: Number,
  byProvider: { [provider: string]: UsageCounters },
  byModel: { [modelKey: string]: UsageCounters & { rawModel: string, provider: string } },
  byAccount: { [accountKey: string]: UsageCounters & { rawModel: string, provider: string } },
  byApiKey: { [apiKeyKey: string]: UsageCounters & { rawModel: string, provider: string, apiKeyMasked: string, keyName: string } },
  byEndpoint: { [endpointKey: string]: UsageCounters & { endpoint: string, rawModel: string, provider: string } },
  byAgentMetadata: {
    [dimensionKey: string]: {
      [escapedDimensionValue: string]: {
        requests: Number,
        promptTokens: Number,
        completionTokens: Number,
        cachedTokens: Number,
        cost: Number,
        rawValue: String
      }
    }
  }
}
```

### 3. `UsageHistory` (`usageHistory` collection)
```javascript
{
  timestamp: Date,
  provider: String,
  model: String,
  connectionId: String,
  apiKey: String,
  endpoint: String,
  promptTokens: Number,
  completionTokens: Number,
  cost: Number,
  status: String,
  tokens: Object,
  agentMetadata: Object,
  meta: Object
}
```

### 4. `Setting` (`settings` collection)
```javascript
{
  _id: "global",
  data: {
    ...DEFAULT_SETTINGS,
    agentMetadataKeys: ["os", "hostname", "agent-name", ...string[]]
  },
  updatedAt: Date
}
```

## Contract Design

### 1. `GET /api/settings` & `PATCH /api/settings`
- **`GET /api/settings` Response (200 OK)**:
```json
{
  "agentMetadataKeys": ["os", "hostname", "agent-name"],
  "enableObservability": true,
  "observabilityMaxRecords": 1000
}
```
- **`PATCH /api/settings` Request Body**:
```json
{
  "agentMetadataKeys": ["os", "hostname", "agent-name", "client-mode"]
}
```
- **Validation**: `agentMetadataKeys` deve ser um array de strings não vazias, cada chave contendo apenas caracteres alfanuméricos, hífen ou sublinhado (`/^[a-zA-Z0-9_-]+$/`). HTTP 400 retornado se inválido.

### 2. `GET /api/usage/request-details`
- **Query Parameters**:
  - `page`: `number` (default: 1)
  - `pageSize`: `number` (default: 20, max: 100)
  - `provider`: `string`
  - `model`: `string`
  - `connectionId`: `string`
  - `status`: `string`
  - `startDate`: `string` (ISO date)
  - `endDate`: `string` (ISO date)
  - `agentMetadata.<key>=<value>` ou `agentMetadata[<key>]=<value>` (ex.: `?agentMetadata.os=linux&agentMetadata.agent-name=pi`)
- **Response (200 OK)**:
```json
{
  "details": [
    {
      "id": "66c75...",
      "timestamp": "2026-08-22T15:20:00.000Z",
      "provider": "openai",
      "model": "gpt-4o",
      "connectionId": "conn_123",
      "status": "success",
      "latency": { "ttft": 240, "total": 1200 },
      "tokens": { "prompt_tokens": 150, "completion_tokens": 80, "cached_tokens": 0 },
      "agentMetadata": {
        "os": "linux",
        "hostname": "workstation-01",
        "agent-name": "pi"
      },
      "errorLabel": null,
      "cacheKey": null,
      "sessionId": null,
      "conversationId": null,
      "rawSessionId": null,
      "request": { "redacted": true },
      "providerRequest": { "redacted": true },
      "providerResponse": { "redacted": true },
      "response": { "redacted": true }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 42,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 3. `GET /api/usage/stats`
- **Query Parameter**: `period` (`today` | `24h` | `7d` | `30d` | `60d` | `all`)
- **Response (200 OK)**:
```json
{
  "totalRequests": 1200,
  "totalPromptTokens": 450000,
  "totalCompletionTokens": 120000,
  "totalCachedTokens": 30000,
  "totalCost": 1.45,
  "byProvider": { ... },
  "byModel": { ... },
  "byAccount": { ... },
  "byApiKey": { ... },
  "byEndpoint": { ... },
  "byAgentMetadata": {
    "agent-name": {
      "pi": {
        "requests": 800,
        "promptTokens": 300000,
        "completionTokens": 90000,
        "cachedTokens": 25000,
        "cost": 1.10,
        "rawValue": "pi",
        "lastUsed": "2026-08-22"
      },
      "claude": {
        "requests": 400,
        "promptTokens": 150000,
        "completionTokens": 30000,
        "cachedTokens": 5000,
        "cost": 0.35,
        "rawValue": "claude",
        "lastUsed": "2026-08-22"
      }
    },
    "os": {
      "linux": {
        "requests": 1000,
        "promptTokens": 380000,
        "completionTokens": 100000,
        "cachedTokens": 28000,
        "cost": 1.25,
        "rawValue": "linux",
        "lastUsed": "2026-08-22"
      }
    }
  }
}
```

### 4. `GET /api/usage/metadata-values`
- **Query Parameters**: `key`: `string` (obrigatório, ex.: `?key=agent-name`)
- **Response (200 OK)**:
```json
{
  "key": "agent-name",
  "values": ["claude", "cline", "codex", "openclaw", "pi"]
}
```
- **Error (400 Bad Request)**: `{ "error": "Missing key query parameter" }`

## Interaction / Sequence

```
[Cliente CLI / API] ──(POST /v1/chat/completions with _agent_metadata)──> [chatCore]
                                                                              │
                                                                 normalizeAgentMetadata()
                                                                              │
                                                ┌─────────────────────────────┴─────────────────────────────┐
                                                ▼                                                           ▼
                                      [requestDetail.js]                                            [usageRepo.js]
                                                │                                                           │
                                        saveRequestDetail()                                         saveRequestUsage()
                                                │                                                           │
                                        [writeBuffer Queue]                                           $inc atomic
                                                │ (flushToDatabase)                                         ▼
                                                ▼                                                    [UsageDaily]
                                         [RequestDetail]                                           (byAgentMetadata)
                                   (agentMetadata + Indexes)
```

1. **Recepção e Normalização**: `chatCore` intercepta a requisição e invoca `normalizeAgentMetadata(body._agent_metadata || clientRawRequest?.body?._agent_metadata)`.
2. **Buffer de Observabilidade**: `buildRequestDetail` anexa o objeto `agentMetadata` normalizado ao registro. `saveRequestDetail` insere no buffer em memória.
3. **Persistência Assíncrona**: No flush do timer/batch, `flushToDatabase` grava documentos em lote no MongoDB usando `RequestDetail.bulkWrite`, populando o campo raiz `agentMetadata` e atualizando os índices compostos e wildcard.
4. **Agregação Atômica de Uso**: Concomitantemente, `saveUsageStats` despacha `saveRequestUsage` que incrementa via `$inc` as métricas por dimensão em `UsageDaily.byAgentMetadata.<dim>.<escapedVal>`.
5. **Consulta de Histórico e Filtros**: Quando o usuário pesquisa no dashboard de requisições, a rota `/api/usage/request-details` traduz os parâmetros `agentMetadata.<key>=<val>` em query Mongo `{ "agentMetadata.<key>": <val> }`, beneficiando-se diretamente do índice.
6. **Consulta de Métricas**: O dashboard requisita `GET /api/usage/stats?period=7d` e recebe as agregações prontas em `byAgentMetadata`.

## Failure Modes & Rollback

- **Payload de `_agent_metadata` Malformado ou Hostil**:
  - *Falha*: Cliente envia tipos não array/não objeto, ou chaves contendo operadores Mongo (ex.: `$where`, `__proto__`, dot notation profunda `a.b.c.d`).
  - *Tratamento*: `normalizeAgentMetadata` filtra estritamente por regex `/^[a-zA-Z0-9_-]+$/`, descarta chaves que iniciem com `$` ou contenham `.`, limita tipos de valores a strings/números/booleanos com corte em 256 bytes e ignora entradas inválidas sem quebrar o processamento da requisição de chat.
- **Valores de Metadados com Caracteres Especiais no `$inc` do Mongo**:
  - *Falha*: Valores de metadados como hostnames (`server.internal.net`) ou versões (`v1.2.3`) contêm pontos (`.`), o que fragmentaria o path do operador `$inc` em sub-objetos aninhados indesejados.
  - *Tratamento*: O valor do sub-path em `byAgentMetadata` é sanitizado com codificação segura de pontos (ex.: `val.replace(/\./g, "_dot_")` ou `encodeURIComponent`), mantendo a chave original preservada no atributo `rawValue`.
- **Mongoose / MongoDB Schema Desatualizado em Instâncias Antigas**:
  - *Falha*: Documentos antigos gravados sem `agentMetadata` retornam `undefined`.
  - *Tratamento*: `docToDetail` e queries tratam `doc.agentMetadata || {}`, garantindo compatibilidade retroativa total.
- **Migration**:
  - Não requer migração destrutiva ou bloqueante. Documentos existentes no MongoDB continuarão legíveis sem `agentMetadata` (`null` ou `{}`).
  - Os índices Mongoose (`RequestDetailSchema.index`) são criados automaticamente pelo Mongoose na inicialização da conexão ou via script idempotente de indexação.
- **Rollback**:
  - `git revert` do commit restaura o código sem afetar a integridade da base.
  - Os campos adicionais `agentMetadata` e `byAgentMetadata` em documentos já salvos serão ignorados pelos schemas antigos devido à flag `strict: false`.

## Non-Functional

- **Performance & Latency**:
  - Ingestão de `_agent_metadata` é $O(k)$ em memória onde $k \le 20$ chaves de metadados, adicionando $< 0.1\text{ms}$ ao pipeline de request.
  - Índices compostos `{ "agentMetadata.<key>": 1, timestamp: -1 }` nas chaves padrão (`agent-name`, `os`, `hostname`) garantem que queries com ordenação por tempo executem Index Scans diretos sem Sort in-memory no MongoDB.
  - Agregações em `UsageDaily` mantêm custo de leitura $O(D)$ onde $D$ é o número de dias no período (máx 60 documentos diários), garantindo resposta da API de stats em $< 15\text{ms}$.
- **Security & RBAC**:
  - Chaves de metadados são estritamente saneadas contra injeção de operadores MongoDB.
  - Redação de payloads em `/api/usage/request-details` oculta o conteúdo de conversas (`request`, `providerRequest`, `providerResponse`, `response`), mas expõe `agentMetadata` estruturado para permitir auditoria operacional segura.
  - O endpoint de detalhes individuais com payload completo (`GET /api/usage/request-details/[id]`) continua protegido por autenticação obrigatória de sessão de dashboard (`verifyDashboardAuthToken`).
- **Scalability & Limits**:
  - Proteção contra alta cardinalidade desenfreada: a agregação em `UsageDaily` acumula apenas as chaves cadastradas em `agentMetadataKeys` (ou até um teto seguro de 20 dimensões distintas por dia).

## Architecture Traceability

| Requirement (EARS back) | Architectural decision | Affected contract/data | Validation | Basis | Status |
|---|---|---|---|---|---|
| Configuração de Chaves | Default `agentMetadataKeys: ["os", "hostname", "agent-name"]` em `DEFAULT_SETTINGS` com leitura/escrita via `settingsRepo`. | `SettingSchema`, `GET/PATCH /api/settings` | `npm test -- tests/unit/db-settings.test.js` | A3 | defined |
| Atualização de Configuração | Validação de array de strings alfanuméricas em `PATCH /api/settings` e persistência no documento `global`. | `PATCH /api/settings` | Teste de integração HTTP com payload válido e inválido | A3 | defined |
| Extração e Normalização | Criação de helper `normalizeAgentMetadata` invocado em `chatCore` e `buildRequestDetail`. | `open-sse/handlers/chatCore/requestDetail.js` | Testes unitários com arrays `[{ key, value }]` e objetos com caracteres especiais | A4 | defined |
| Persistência e Indexação em RequestDetail | Armazenamento de `agentMetadata` como campo raiz e criação de índices compostos e wildcard no `RequestDetailSchema`. | `RequestDetailSchema`, `requestDetailsRepo.js` | `npm test -- tests/unit/db-request-details.test.js` | A1, A5 | defined |
| Agregação de Métricas em UsageDaily | `$inc` atômico em `byAgentMetadata` no `saveRequestUsage` para cada dimensão e valor sanitizado. | `UsageDailySchema`, `usageRepo.js` | `npm test -- tests/unit/db-usage.test.js` | A2, A7 | defined |
| Filtro de Requisições por Metadados | Suporte a `agentMetadata.<key>` e `agentMetadata[<key>]` no parser de queries de `requestDetailsRepo.getRequestDetails`. | `requestDetailsRepo.js`, `GET /api/usage/request-details` | Teste de busca filtrada por `agentMetadata.os=linux` | A5, A6 | defined |
| Exposição Transparente sem Redação | Preservação de `agentMetadata` na montagem do array de detalhes em `GET /api/usage/request-details`. | `src/app/api/usage/request-details/route.js` | Teste de verificação de redação de mensagens preservando `agentMetadata` | A6 | defined |
| Endpoint de Valores Distintos | Implementação de `GET /api/usage/metadata-values?key=<key>` usando `RequestDetail.distinct`. | `src/app/api/usage/metadata-values/route.js` | Teste HTTP com chave existente e inexistente | A8 | defined |
| Métricas no Dashboard de Uso | Retorno de `byAgentMetadata` estruturado no payload de `GET /api/usage/stats`. | `src/app/api/usage/stats/route.js`, `usageRepo.js` | Teste de `getUsageStats` consolidando `byAgentMetadata` | A7 | defined |

## Open Questions

- none

## Readiness Gates

- [x] `AGENTS.md` and `spec.md` read.
- [x] Approach chosen with alternatives and tradeoffs.
- [x] Data model and contract design closed or `none` justified.
- [x] Minimalism and client alignment reviewed; unnecessary architecture was removed or simplified.
- [x] Migration and rollback defined when state/contract changes.
- [x] Every backend requirement has a traceable architectural decision (`A#`).
- [x] Guardian approved `arch.md`.

## Definition of Done

- [x] Architecture sustains every backend requirement with traceability.
- [x] Contract and persistence designed, not merely cited.
- [x] Migration/rollback and failure modes defined.
- [x] Guardian approved.
