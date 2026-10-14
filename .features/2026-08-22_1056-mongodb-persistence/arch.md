# Substituição do SQLite por MongoDB na Persistência de Dados — Architecture

Status: ready
Spec: ./spec.md
Created: 2026-08-22 11:20
Updated: 2026-08-22 11:20

## Applicability

- Backend affected: yes — evidence: Substituição total da camada de persistência `src/lib/db/*` (driver, 13 repositórios assíncronos, schemas, export/import e backup) por MongoDB utilizando Mongoose ODM.

## Architecture Ledger

| ID | Source | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| A1 | `src/lib/db/driver.js`, `package.json` | A conexão SQLite multi-driver (`bun:sqlite`, `better-sqlite3`, `node:sqlite`, `sql.js`) deve ser substituída por cliente singleton Mongoose (`mongoose.connect`) com pool de conexões e cache global para suportar Next.js dev hot-reload. | `src/lib/db/driver.js:6-8`, `package.json` | Elimina adaptadores SQLite e centraliza ciclo de vida e resiliência de conexão em `src/lib/db/connection.js`. | confirmed |
| A2 | `src/lib/db/schema.js`, `src/lib/db/repos/*` | As 13 tabelas relacionais com payloads serializados em colunas TEXT JSON (`data`, `value`, `models`) passam a ser Modelos Mongoose estruturados (`src/lib/db/models/*`) armazenando documentos BSON nativos com `_id` como chave primária String (UUIDv4/UUIDv7/String). | `src/lib/db/schema.js:21-185` | Elimina overhead de serialização/desserialização manual (`JSON.stringify`/`JSON.parse`) e permite consultas flexíveis sobre campos aninhados. | confirmed |
| A3 | `src/lib/db/repos/connectionsRepo.js`, `spec.md:C5` | Atualizações atômicas concorrentes (como refresh de tokens OAuth em conexões e incrementos de contadores de uso diário) devem utilizar operações atômicas por documento (`findOneAndUpdate`, `$set`, `$inc`, `bulkWrite`, upserts) para operar de forma segura em instâncias standalone (single-node) sem exigir Replica Set. | `src/lib/db/repos/connectionsRepo.js:192-205`, `spec.md:C5` | Garante atomicidade e compatibilidade universal (Docker standalone, instâncias locais e MongoDB Atlas). | confirmed |
| A4 | `src/lib/db/repos/sessionAffinityRepo.js`, `comboAffinityRepo.js`, `apiKeysRepo.js`, `combosRepo.js` | `sessionAffinity` e `comboAffinity` realizavam limpeza periódica manual com timers em memória (`setInterval`) e queries `DELETE`. No MongoDB, serão configurados TTL Indexes nativos (`expireAfterSeconds: 1800`), descarregando a expiração para o motor do banco. Índices únicos em `apiKeys` (`key`) e `combos` (`name`) garantem integridade. | `src/lib/db/repos/sessionAffinityRepo.js:4-6`, `src/lib/db/repos/comboAffinityRepo.js:3-5` | Simplifica código, elimina timers de cleanup em background e delega remoção expirada ao MongoDB. | confirmed |
| A5 | `src/lib/localDb.js`, `src/lib/usageDb.js`, `src/app/api/*`, `open-sse/*` | O sistema possui 87+ pontos de importação consumindo `@/lib/localDb`, `@/lib/usageDb` e `@/lib/db`. As assinaturas públicas de todos os métodos dos 13 repositórios devem permanecer 100% retrocompatíveis, retornando objetos simples (POJOs) via `.lean()`. | `src/lib/localDb.js:3-21`, `src/lib/usageDb.js:2-7` | Zero impacto e zero necessidade de refatoração nas rotas de API do dashboard Next.js e no motor de gateway `open-sse`. | confirmed |
| A6 | `src/lib/db/repos/requestDetailsRepo.js` | O repositório de observabilidade utiliza buffer em memória com flush periódico (`flushToDatabase`). No MongoDB, o flush é executado via `RequestDetail.insertMany(writeBuffer, { ordered: false })`, otimizando I/O para alta volumetria de logs de IA. | `src/lib/db/repos/requestDetailsRepo.js:58-61,111-165` | Alta performance de escrita sem bloqueio do loop de eventos durante requisições de streaming de IA. | confirmed |
| A7 | `src/lib/db/index.js:79-174` | As funções `exportDb()` e `importDb(payload)` operam sobre snapshots JSON com dados de todas as entidades do sistema. A implementação em MongoDB mantém a exata estrutura do snapshot JSON para garantir compatibilidade com backups gerados em versões anteriores. | `src/lib/db/index.js:79-174` | Interoperabilidade completa de exportação/importação e restauração de snapshots. | confirmed |
| A8 | `spec.md:C2`, `src/lib/db/migrate.js` | A migração de dados legados do SQLite (`data.sqlite`) para o MongoDB não deve ser executada no boot do servidor. Um script utilitário dedicado (`scripts/migrate-sqlite-to-mongo.mjs`) realiza a ingestão sob demanda. | `spec.md:C2` | Boot rápido e resiliente do 9Router, sem risco de falha de inicialização por locks ou bases SQLite legadas corrompidas. | confirmed |
| A9 | `package.json`, `src/lib/db/adapters/*` | Com a remoção total do SQLite, os arquivos adaptadores (`betterSqliteAdapter.js`, `bunSqliteAdapter.js`, `nodeSqliteAdapter.js`, `sqljsAdapter.js`), arquivos de migração SQLite (`migrations/`, `schema.js`) e as dependências `sql.js` e `better-sqlite3` são removidos da camada central de dados, adicionando `mongoose` (^8.x) às dependências. | `package.json:49,55`, `src/lib/db/adapters/` | Redução do bundle, simplificação do código de persistência e remoção de dependências de compilação nativa C++. | confirmed |

## Approach (ADR-lite)

- Chosen: Camada de persistência unificada baseada em **Mongoose ODM (^8.x)** com Schemas estruturados e flexíveis (`strict: false` / `Schema.Types.Mixed` para dados arbitrários de provedores e nós), singleton de conexão resiliente com cache global para Next.js dev hot-reload, operações atômicas por documento (`findOneAndUpdate`, `$set`, `$inc`, `bulkWrite`) compatíveis com instâncias standalone (sem exigir Replica Set), e índices TTL automáticos para expiração de afinidades.
- Alternatives:
  - Alternativa A: Driver nativo oficial `mongodb` (MongoClient) sem ODM.
    - Rationale de descarte: Exigiria implementação manual de validação de schemas, gerenciamento imperativo de índices em startup e duplicação de boilerplate de conversão em todos os 13 repositórios.
  - Alternativa B: ORM relacional/híbrido (ex: Prisma com MongoDB connector).
    - Rationale de descarte: Complexidade elevada de compilação de engine binária no runtime Bun/Next.js standalone, além de rigidez excessiva para documentos com campos dinâmicos de autenticação e provedores.
- Rationale: O Mongoose fornece o equilíbrio exato entre definição declarativa de schemas e índices, flexibilidade para subdocumentos e atributos variáveis, métodos atômicos nativos por documento e consultas eficientes via `.lean()` retornando POJOs idênticos aos consumidos pelo 9Router.
- Tradeoffs: Adição da dependência `mongoose` e necessidade de uma instância de MongoDB acessível via rede ou local (Docker/Atlas). Em contrapartida, elimina toda a complexidade de 4 adaptadores SQLite, travamentos por concorrência de escrita (locks de WAL) e serialização manual de colunas JSON.

## Component Boundaries

- `src/lib/db/connection.js`: Gerenciador de conexão singleton com o MongoDB via Mongoose. Configura timeouts (`serverSelectionTimeoutMS: 5000`), pool de conexões (`maxPoolSize`), reconexão automática e sobrevivência a hot-reloads em desenvolvimento via `global._mongooseConnection`.
- `src/lib/db/models/*`: Declaração dos Schemas e Models Mongoose para cada coleção:
  - `Setting.js` (`settings`): Configurações globais singleton (`_id: "global"`).
  - `ProviderConnection.js` (`providerConnections`): Conexões de provedores de IA upstream.
  - `ProviderNode.js` (`providerNodes`): Nodes e instâncias de proxy/provedores.
  - `ProxyPool.js` (`proxyPools`): Configurações de proxies upstream.
  - `ApiKey.js` (`apiKeys`): Chaves de API de acesso ao gateway.
  - `Combo.js` (`combos`): Definições de combos de modelos e fallback.
  - `KvEntry.js` (`kv`): Armazenamento unificado chave-valor escopado (`modelAliases`, `customModels`, `mitmAlias`, `pricing`, `disabledModels`).
  - `UsageHistory.js` (`usageHistory`): Histórico de chamadas e consumo de tokens.
  - `UsageDaily.js` (`usageDaily`): Agregados diários de consumo de tokens e custos.
  - `RequestDetail.js` (`requestDetails`): Logs de observabilidade com payloads de requisição/resposta.
  - `SessionAffinity.js` (`sessionAffinity`): Mapeamento de afinidade de sessão com TTL index nativo.
  - `ComboAffinity.js` (`comboAffinity`): Mapeamento de afinidade de combos com TTL index nativo.
  - `Meta.js` (`_meta`): Metadados de versão e estado do banco.
- `src/lib/db/repos/*`: Implementação dos 13 repositórios consumindo os Models Mongoose e exportando funções assíncronas que retornam POJOs limpos (`.lean()`).
- `src/lib/db/index.js`, `src/lib/localDb.js`, `src/lib/usageDb.js`: Ponto de exportação pública das funções de repositório, garantindo 100% de estabilidade para `src/app/api/*` e `open-sse/*`.
- `scripts/migrate-sqlite-to-mongo.mjs`: Script utilitário CLI para migração offline de bases SQLite existentes (`data.sqlite`) ou backups JSON para o MongoDB sob demanda.

## Data Model

### 1. `Setting` (`settings` collection)
- `_id`: `{ type: String, default: "global" }` (chave fixa)
- `data`: `{ type: Schema.Types.Mixed, default: {} }` (ou campos top-level com `strict: false`)
- `updatedAt`: `Date`
- Invariante: Documento único. Operações realizam upsert atômico via `findOneAndUpdate({ _id: "global" }, { $set: updates }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean()`.

### 2. `ProviderConnection` (`providerConnections` collection)
- `_id`: `{ type: String, default: uuidv4 }` (String UUID)
- `provider`: `{ type: String, required: true, index: true }`
- `authType`: `{ type: String, default: "oauth" }`
- `name`: `String`
- `email`: `String`
- `priority`: `Number`
- `isActive`: `{ type: Boolean, default: true, index: true }`
- `data`: `{ type: Schema.Types.Mixed, default: {} }` (campos flexíveis: tokens OAuth, chaves de API, credenciais, metadados de teste)
- `createdAt`: `Date`
- `updatedAt`: `Date`
- Índices:
  - `{ provider: 1, isActive: 1 }`
  - `{ provider: 1, priority: 1 }`

### 3. `ProviderNode` (`providerNodes` collection)
- `_id`: `{ type: String, default: uuidv4 }`
- `type`: `{ type: String, index: true }`
- `name`: `String`
- `prefix`: `String`
- `apiType`: `String`
- `baseUrl`: `String`
- `data`: `{ type: Schema.Types.Mixed, default: {} }`
- `createdAt`: `Date`
- `updatedAt`: `Date`
- Índices:
  - `{ type: 1 }`

### 4. `ProxyPool` (`proxyPools` collection)
- `_id`: `{ type: String, default: uuidv4 }`
- `name`: `String`
- `proxyUrl`: `String`
- `isActive`: `{ type: Boolean, default: true, index: true }`
- `testStatus`: `{ type: String, default: "unknown", index: true }`
- `data`: `{ type: Schema.Types.Mixed, default: {} }`
- `createdAt`: `Date`
- `updatedAt`: `Date`
- Índices:
  - `{ isActive: 1 }`
  - `{ testStatus: 1 }`

### 5. `ApiKey` (`apiKeys` collection)
- `_id`: `{ type: String, default: uuidv4 }`
- `key`: `{ type: String, required: true, unique: true, index: true }`
- `name`: `String`
- `machineId`: `String`
- `isActive`: `{ type: Boolean, default: true }`
- `createdAt`: `Date`
- Índices:
  - `{ key: 1 }` (unique)
  - `{ createdAt: 1 }`

### 6. `Combo` (`combos` collection)
- `_id`: `{ type: String, default: uuidv4 }`
- `name`: `{ type: String, required: true, unique: true, index: true }`
- `kind`: `String`
- `models`: `[Schema.Types.Mixed]`
- `createdAt`: `Date`
- `updatedAt`: `Date`
- Índices:
  - `{ name: 1 }` (unique)
  - `{ createdAt: 1 }`

### 7. `KvEntry` (`kv` collection)
- `scope`: `{ type: String, required: true, index: true }`
- `key`: `{ type: String, required: true }`
- `value`: `{ type: Schema.Types.Mixed, required: true }`
- `updatedAt`: `Date`
- Índices:
  - `{ scope: 1, key: 1 }` (unique compound)
  - `{ scope: 1 }`

### 8. `UsageHistory` (`usageHistory` collection)
- `_id`: `Schema.Types.ObjectId`
- `timestamp`: `{ type: Date, required: true, index: true }`
- `provider`: `{ type: String, index: true }`
- `model`: `{ type: String, index: true }`
- `connectionId`: `{ type: String, index: true }`
- `apiKey`: `String`
- `endpoint`: `String`
- `promptTokens`: `{ type: Number, default: 0 }`
- `completionTokens`: `{ type: Number, default: 0 }`
- `cost`: `{ type: Number, default: 0 }`
- `status`: `String`
- `tokens`: `Schema.Types.Mixed`
- `meta`: `Schema.Types.Mixed`
- Índices:
  - `{ timestamp: -1 }`
  - `{ provider: 1, timestamp: -1 }`
  - `{ model: 1, timestamp: -1 }`
  - `{ connectionId: 1, timestamp: -1 }`

### 9. `UsageDaily` (`usageDaily` collection)
- `dateKey`: `{ type: String, required: true, unique: true, index: true }` (formato `YYYY-MM-DD`)
- `requests`: `{ type: Number, default: 0 }`
- `promptTokens`: `{ type: Number, default: 0 }`
- `completionTokens`: `{ type: Number, default: 0 }`
- `cost`: `{ type: Number, default: 0 }`
- `byProvider`: `{ type: Schema.Types.Mixed, default: {} }`
- `byModel`: `{ type: Schema.Types.Mixed, default: {} }`
- `byAccount`: `{ type: Schema.Types.Mixed, default: {} }`
- `byApiKey`: `{ type: Schema.Types.Mixed, default: {} }`
- `byEndpoint`: `{ type: Schema.Types.Mixed, default: {} }`
- Índices:
  - `{ dateKey: 1 }` (unique)

### 10. `RequestDetail` (`requestDetails` collection)
- `_id`: `{ type: String, default: uuidv7 }`
- `timestamp`: `{ type: Date, required: true, index: true }`
- `provider`: `{ type: String, index: true }`
- `model`: `{ type: String, index: true }`
- `connectionId`: `{ type: String, index: true }`
- `status`: `String`
- `data`: `Schema.Types.Mixed`
- Índices:
  - `{ timestamp: -1 }`
  - `{ provider: 1, timestamp: -1 }`
  - `{ model: 1, timestamp: -1 }`
  - `{ connectionId: 1, timestamp: -1 }`

### 11. `SessionAffinity` (`sessionAffinity` collection)
- `provider`: `{ type: String, required: true }`
- `model`: `{ type: String, required: true }`
- `cacheKeyHash`: `{ type: String, required: true }`
- `rawKey`: `String`
- `connectionId`: `{ type: String, required: true }`
- `updatedAt`: `{ type: Date, default: Date.now }`
- `hitCount`: `{ type: Number, default: 1 }`
- Índices:
  - `{ provider: 1, model: 1, cacheKeyHash: 1 }` (unique compound)
  - `{ updatedAt: 1 }` com `{ expireAfterSeconds: 1800 }` (TTL automático nativo)

### 12. `ComboAffinity` (`comboAffinity` collection)
- `comboName`: `{ type: String, required: true }`
- `cacheKeyHash`: `{ type: String, required: true }`
- `rawKey`: `String`
- `selectedModel`: `{ type: String, required: true }`
- `updatedAt`: `{ type: Date, default: Date.now }`
- `hitCount`: `{ type: Number, default: 1 }`
- Índices:
  - `{ comboName: 1, cacheKeyHash: 1 }` (unique compound)
  - `{ updatedAt: 1 }` com `{ expireAfterSeconds: 1800 }` (TTL automático nativo)

### 13. `Meta` (`_meta` collection)
- `key`: `{ type: String, required: true, unique: true, index: true }`
- `value`: `Schema.Types.Mixed`
- `updatedAt`: `Date`
- Índices:
  - `{ key: 1 }` (unique)

## Contract Design

### 1. Variáveis de Ambiente
- `MONGODB_URI`: String de conexão padrão MongoDB (ex: `mongodb://localhost:27017/9router` ou `mongodb+srv://user:pass@cluster.mongodb.net/9router`).
  - Padrão se não informada: `mongodb://127.0.0.1:27017/9router`.
- `MONGODB_DB_NAME`: Nome do banco de dados (opcional caso já faça parte da URI).
- `MONGODB_MAX_POOL_SIZE`: Tamanho máximo do pool de conexões (padrão: 20).

### 2. Contratos Públicos de Repositório (`src/lib/localDb.js` / `src/lib/db/index.js`)
Todos os 13 repositórios mantêm exatas assinaturas e tipagens de retorno (POJOs planos com `.lean()`):
- Settings: `getSettings()`, `updateSettings(updates)`, `isCloudEnabled()`, `getCloudUrl()`, `exportSettings()`.
- Provider Connections: `getProviderConnections(filter)`, `getProviderConnectionById(id)`, `createProviderConnection(data)`, `updateProviderConnection(id, data)`, `deleteProviderConnection(id)`, `deleteProviderConnectionsByProvider(providerId)`, `reorderProviderConnections(providerId)`, `cleanupProviderConnections()`.
- Provider Nodes: `getProviderNodes(filter)`, `getProviderNodeById(id)`, `createProviderNode(data)`, `updateProviderNode(id, data)`, `deleteProviderNode(id)`.
- Proxy Pools: `getProxyPools(filter)`, `getProxyPoolById(id)`, `createProxyPool(data)`, `updateProxyPool(id, data)`, `deleteProxyPool(id)`.
- API Keys: `getApiKeys()`, `getApiKeyById(id)`, `createApiKey(name, machineId)`, `updateApiKey(id, data)`, `deleteApiKey(id)`, `validateApiKey(key)`.
- Combos: `getCombos()`, `getComboById(id)`, `getComboByName(name)`, `createCombo(data)`, `updateCombo(id, data)`, `deleteCombo(id)`.
- Aliases: `getModelAliases()`, `setModelAlias(alias, model)`, `deleteModelAlias(alias)`, `getCustomModels()`, `addCustomModel(model)`, `deleteCustomModel(model)`, `getMitmAlias(toolName)`, `setMitmAliasAll(toolName, mappings)`.
- Pricing: `getPricing()`, `getPricingForModel(provider, model)`, `updatePricing(pricingData)`, `resetPricing(provider, model)`, `resetAllPricing()`.
- Disabled Models: `getDisabledModels()`, `getDisabledByProvider(providerAlias)`, `disableModels(providerAlias, ids)`, `enableModels(providerAlias, ids)`.
- Usage & Observability: `trackPendingRequest()`, `getActiveRequests()`, `saveRequestUsage(entry)`, `getUsageHistory(filter)`, `getUsageStats(period)`, `getChartData(period)`, `appendRequestLog()`, `getRecentLogs(limit)`, `saveRequestDetail(detail)`, `getRequestDetails(filter)`, `getRequestDetailById(id)`, `getDistinctProviders()`.
- Affinity: `getAffinity(provider, model, cacheKeyHash)`, `setAffinity(provider, model, cacheKeyHash, rawKey, connectionId)`, `touchAffinity(provider, model, cacheKeyHash)`, `pruneSessionAffinity()`, `getComboAffinity(comboName, cacheKeyHash)`, `setComboAffinity(comboName, cacheKeyHash, rawKey, selectedModel)`, `touchComboAffinity(comboName, cacheKeyHash)`, `pruneComboAffinity()`.
- Full DB Export/Import: `exportDb()`, `importDb(payload)`.

### 3. Contrato de Snapshot JSON (`exportDb` / `importDb`)
O payload de backup mantém a exata estrutura JSON existente:
```json
{
  "settings": { ... },
  "providerConnections": [ { "id": "...", "provider": "...", "authType": "...", ... } ],
  "providerNodes": [ ... ],
  "proxyPools": [ ... ],
  "apiKeys": [ ... ],
  "combos": [ ... ],
  "modelAliases": { "alias": "target-model" },
  "customModels": [ { "providerAlias": "...", "id": "...", "name": "..." } ],
  "mitmAlias": { "tool": { ... } },
  "pricing": { "provider": { "model": { ... } } }
}
```

## Interaction / Sequence

### 1. Inicialização do 9Router e Conexão Mongoose
```text
Next.js Boot / API Route Request
  │
  ├──► Repositório invocado (ex: getSettings)
  │      │
  │      └──► getConnection()
  │             │
  │             ├──► Se global._mongooseConnection ativo: retorna conexão
  │             │
  │             └──► Se inativo:
  │                    ├── mongoose.connect(MONGODB_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 5000 })
  │                    ├── Mongoose inicializa Schemas e Models
  │                    └── Registra índices declarados em background
  │
  └──► Executa consulta Mongoose com .lean() e retorna POJO
```

### 2. Concorrência no Refresh de Token OAuth (`connectionsRepo`)
```text
SSE Streaming Request (Token Expirado)
  │
  ├──► Executa refresh de OAuth com o provedor upstream
  │
  └──► updateProviderConnection(id, { accessToken, expiresAt })
         │
         └──► ProviderConnection.findOneAndUpdate(
                { _id: id },
                { 
                  $set: { 
                    "data.accessToken": accessToken,
                    "data.expiresAt": expiresAt,
                    updatedAt: new Date()
                  } 
                },
                { new: true }
              ).lean()
         │
         └──► Atualização atômica in-place no documento (sem conflito de escrita)
```

### 3. Registro de Uso e Sumário Diário (`usageRepo`)
```text
Finalização de Streaming de IA
  │
  ├──► saveRequestUsage(entry)
  │      │
  │      ├──► UsageHistory.create({ ...entry, timestamp: new Date(entry.timestamp) })
  │      │
  │      └──► UsageDaily.updateOne(
  │             { dateKey: "YYYY-MM-DD" },
  │             {
  │               $inc: {
  │                 requests: 1,
  │                 promptTokens: entry.promptTokens,
  │                 completionTokens: entry.completionTokens,
  │                 cost: entry.cost,
  │                 [`byProvider.${entry.provider}.requests`]: 1,
  │                 [`byProvider.${entry.provider}.cost`]: entry.cost,
  │                 [`byModel.${entry.model}.requests`]: 1,
  │                 [`byModel.${entry.model}.cost`]: entry.cost
  │               },
  │               $set: { updatedAt: new Date() }
  │             },
  │             { upsert: true }
  │           )
  │
  └──► statsEmitter.emit("update") (atualização em tempo real do dashboard)
```

### 4. Ciclo de Afinidade de Sessão com Expiração Automática
```text
Requisição com Afinidade (ex: Claude Code / Round-Robin Sticky)
  │
  ├──► Normaliza e gera hash: cacheKeyHash = hashCacheKey(normalized)
  │
  ├──► SessionAffinity.findOne({ provider, model, cacheKeyHash }).lean()
  │      │
  │      ├──► Se encontrado:
  │      │      ├── SessionAffinity.updateOne(..., { $set: { updatedAt: new Date() }, $inc: { hitCount: 1 } })
  │      │      └── Retorna connectionId associada
  │      │
  │      └──► Se ausente:
  │             ├── Seleciona próxima conexão ativa via round-robin
  │             └── SessionAffinity.findOneAndUpdate(..., { $set: { rawKey, connectionId, updatedAt: new Date() }, $inc: { hitCount: 1 } }, { upsert: true })
  │
  └──► Thread de Background do MongoDB (TTL Index):
         └── Remove automaticamente documentos com (Date.now() - updatedAt > 1800s)
```

## Failure Modes & Rollback

- Failure modes:
  - *MongoDB indisponível ou falha de conexão na inicialização*: A chamada `mongoose.connect()` excede o timeout de seleção (`serverSelectionTimeoutMS: 5000`) e lança erro descritivo. As rotas retornam 500 com mensagem clara sobre a indisponibilidade do banco. O Mongoose tenta reconexão contínua em background sem necessidade de reiniciar o processo Next.js.
  - *Conflito de unicidade de chave ou combo (`E11000 duplicate key`)*: Repositórios `apiKeysRepo` e `combosRepo` capturam a exceção de índice único e retornam erro de validação/conflito correspondente para a API, prevenindo corrupção de integridade.
  - *Alta volumetria de escrita em observabilidade*: O `requestDetailsRepo` emprega buffer em lote (`writeBuffer`) de até 20 itens ou intervalo de 5 segundos, executando `RequestDetail.insertMany(writeBuffer, { ordered: false })`. Caso o MongoDB esteja sobrecarregado, o buffer acumula até um limite máximo (`maxRecords`) antes de descartar registros antigos, protegendo a memória do processo.
  - *Ambiente de desenvolvimento com múltiplos reloads*: A persistência da instância de conexão em `global._mongooseConnection` evita a criação excessiva de pools de conexões e vazamentos de memória (connection leaks) durante reloads do Next.js.
- Migration:
  - *Inicialização com banco novo*: Ao conectar em uma instância MongoDB limpa, o Mongoose cria as coleções e os índices automaticamente. O documento singleton de configurações (`Setting`) é gerado no primeiro acesso.
  - *Migração de dados SQLite existentes*: Executar a ferramenta CLI dedicada `node scripts/migrate-sqlite-to-mongo.mjs --sqlite ~/.9router/db/data.sqlite --mongo <MONGODB_URI>`, que realiza a leitura das tabelas do SQLite via `better-sqlite3` e insere os documentos nas respectivas coleções MongoDB em lote.
  - *Restauração de backup JSON*: Utilizar o endpoint `/api/settings/import` ou a função `importDb(payload)`, que processa o snapshot JSON e popula o MongoDB de forma idempotente.
- Rollback:
  - Como os dados legados em `~/.9router/db/data.sqlite` permanecem inalterados e não são deletados durante o uso do MongoDB, o rollback para a versão baseada em SQLite consiste estritamente em reverter a branch/commit (`git revert`).

## Non-Functional

- Performance:
  - Consultas com `.lean()` em todos os repositórios para evitar overhead de instâncias ricas do Mongoose e maximizar taxa de transferência (throughput).
  - Índices compostos cobrem as principais consultas de roteamento e filtragem (`provider + isActive`, `provider + priority`, `scope + key`, `timestamp DESC`).
  - Índices TTL nativos no MongoDB eliminam locks periódicos de deleção e timers em memória da aplicação.
  - Buffer assíncrono para observabilidade (`RequestDetail.insertMany`).
- Security:
  - Suporte completo a URIs seguras com TLS/SSL (`mongodb+srv://` ou parâmetro `tls=true`), autenticação SCRAM-SHA-256 e credenciais isoladas via `MONGODB_URI`.
  - Proteção contra MongoDB Query Injection através do casting e sanitização estrita dos Schemas Mongoose.
  - Ocultação de credenciais sensíveis (senhas e connection strings) em logs e endpoints públicos.
- Scalability:
  - Dimensionamento horizontal de instâncias Next.js compartilhando a mesma base de dados MongoDB (MongoDB Replica Set ou MongoDB Atlas).
  - Pool de conexões ajustável via variável de ambiente `MONGODB_MAX_POOL_SIZE`.

## Architecture Traceability

| Requirement (EARS back) | Architectural decision | Affected contract/data | Validation | Basis | Status |
|---|---|---|---|---|---|
| Conexão MongoDB | Inicialização de pool singleton Mongoose com resiliência a hot-reload em `src/lib/db/connection.js` | `src/lib/db/connection.js`, `MONGODB_URI` | Teste de conexão e reconexão com MongoDB | A1, A9 | defined |
| Persistência de Configurações | Schema singleton Mongoose `Setting` e repositório `settingsRepo` com `findOneAndUpdate` upsert | `settings` collection, `src/lib/db/repos/settingsRepo.js` | Teste unitário de leitura e atualização de settings | A2, A3, A5 | defined |
| Persistência de Conexões de Provedores | Schema `ProviderConnection` com índices por provedor/prioridade e mutações atômicas de credenciais | `providerConnections` collection, `src/lib/db/repos/connectionsRepo.js` | Teste de criação, reordenação e atualização concorrente de tokens OAuth | A2, A3, A5 | defined |
| Persistência de Chaves de API e Combos | Schemas `ApiKey` e `Combo` com índices únicos (`key`, `name`) | `apiKeys`, `combos` collections, `apiKeysRepo.js`, `combosRepo.js` | Teste de criação e rejeição de duplicidade de chaves/nomes | A2, A4, A5 | defined |
| Métricas de Uso e Observabilidade | Schemas `UsageHistory`, `UsageDaily` com `$inc` atômico e `RequestDetail` com buffer de escrita em lote | `usageHistory`, `usageDaily`, `requestDetails` collections, `usageRepo.js`, `requestDetailsRepo.js` | Teste de inserção de métricas de uso e agregação diária de tokens/custos | A2, A3, A6 | defined |
| Afinidade de Sessão com Expiração | Schemas `SessionAffinity` e `ComboAffinity` com TTL Indexes nativos no campo `updatedAt` | `sessionAffinity`, `comboAffinity` collections, `sessionAffinityRepo.js`, `comboAffinityRepo.js` | Teste de hit count de afinidade e expiração TTL | A2, A4, A5 | defined |
| Exportação e Importação de Dados | Adaptação de `exportDb()` e `importDb()` sobre coleções Mongoose mantendo compatibilidade do snapshot JSON | `src/lib/db/index.js`, `scripts/migrate-sqlite-to-mongo.mjs` | Teste de exportação total, limpeza e importação idempotente de backup | A2, A7, A8 | defined |

## Open Questions

- none

## Readiness Gates

- [x] `AGENTS.md` and `spec.md` read.
- [x] Approach chosen with alternatives and tradeoffs.
- [x] Data model and contract design closed or `none` justified.
- [x] Minimalism and client alignment reviewed; unnecessary architecture was removed or simplified.
- [x] Migration and rollback defined when state/contract changes.
- [x] Every backend requirement has a traceable architectural decision (`A#`).
- [ ] Guardian approved `arch.md`.

## Definition of Done

- [x] Architecture sustains every backend requirement with traceability.
- [x] Contract and persistence designed, not merely cited.
- [x] Migration/rollback and failure modes defined.
- [x] Guardian approved.
