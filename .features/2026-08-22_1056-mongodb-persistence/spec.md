# Substituição do SQLite por MongoDB na Persistência de Dados

Status: ready
Created: 2026-08-22 10:56
Updated: 2026-08-22 11:15

## Objective

Projetar e estruturar a substituição da camada de persistência de dados do 9Router (atualmente baseada em SQLite com fallback multi-driver) por MongoDB, conferindo maior flexibilidade no armazenamento de documentos dinâmicos (conexões, modelos customizados, configurações, observabilidade e métricas de uso) e possibilitando operação com bancos distribuídos ou gerenciados (MongoDB Atlas / instâncias dedicadas).

## Context

O 9Router atua como gateway de IA e dashboard Next.js local/distribuído com suporte a múltiplos provedores upstream. O sistema gerencia configurações de autenticação (OAuth, API keys), nodes de provedores, pools de proxy, modelos customizados, aliases, regras de precificação, métricas de consumo de tokens (`usageHistory`, `usageDaily`), detalhes de requisições de observabilidade (`requestDetails`) e afinidade de sessão/combos (`sessionAffinity`, `comboAffinity`).

Atualmente, a camada de persistência em `src/lib/db/` utiliza adaptadores SQLite (`bun:sqlite`, `better-sqlite3`, `node:sqlite`, `sql.js`) e mapeia objetos dinâmicos em colunas JSON (`data`, `tokens`, `value`). A migração para MongoDB permite armazenar diretamente documentos BSON nativos flexíveis, simplificando manipulações parciais, consultas agregadas de uso e escalabilidade horizontal. No entanto, por se tratar de uma aplicação que também opera via CLI local (`9router`), a estratégia de coexistência, modelo de migração de dados legados e compatibilidade de deployment requerem clarificação material.

## Discovery Ledger

| ID | Source | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| D1 | `src/lib/db/driver.js`, `paths.js` | Persistência atual baseada em SQLite local em `DATA_DIR/db/data.sqlite` com cadeia de adaptadores (`bun:sqlite` → `better-sqlite3` → `node:sqlite` → `sql.js`). | `src/lib/db/driver.js:84-90` | A camada de conexão e inicialização de banco (`driver.js`) precisa ser refatorada para instanciar cliente MongoDB via URI. | confirmed |
| D2 | `src/lib/db/index.js`, `repos/*` | Existem 13 repositórios em `src/lib/db/repos/` (`settingsRepo`, `connectionsRepo`, `nodesRepo`, `proxyPoolsRepo`, `apiKeysRepo`, `combosRepo`, `aliasRepo`, `pricingRepo`, `disabledModelsRepo`, `usageRepo`, `requestDetailsRepo`, `sessionAffinityRepo`, `comboAffinityRepo`), além de exportDb/importDb. | `src/lib/db/index.js:5-70` | Todos os repositórios exportam contratos assíncronos que precisam de implementação com operações MongoDB Collection. | confirmed |
| D3 | `src/lib/localDb.js`, `src/lib/usageDb.js`, `src/app/api/*` | As APIs Next.js e o runtime consomem os repositórios através de `@/lib/db`, `@/lib/localDb` e `@/lib/usageDb` chamando métodos assíncronos (`getSettings()`, `getProviderConnections()`, etc.). | `src/lib/localDb.js`, `src/app/api/auth/login/route.js:2` | Os contratos públicos das funções de repositório permanecem estáveis para não quebrar rotas da aplicação. | confirmed |
| D4 | `src/lib/db/schema.js` | Esquema relacional atual possui 13 tabelas (`_meta`, `settings`, `providerConnections`, `providerNodes`, `proxyPools`, `apiKeys`, `combos`, `kv`, `usageHistory`, `usageDaily`, `requestDetails`, `sessionAffinity`, `comboAffinity`). Várias tabelas guardam payloads em coluna TEXT JSON (`data`, `value`, `models`). | `src/lib/db/schema.js:21-170` | As coleções MongoDB correspondentes podem armazenar documentos JSON/BSON nativos em vez de strings serializadas. | confirmed |
| D5 | `src/lib/db/migrate.js`, `src/lib/db/backup.js` | O sistema possui migrações versionadas (`MIGRATIONS`), importação de JSON legados (`.migrated-from-json`) e backups automáticos pré-migração via SQLite ATTACH. | `src/lib/db/migrate.js`, `src/lib/db/backup.js` | A estratégia de migrações e garantia de integridade precisa ser remodelada para coleções e índices MongoDB. | confirmed |
| D6 | `package.json`, `CLAUDE.md` | O projeto é JavaScript puro (ESM) executado em Node.js e Bun. Possui `better-sqlite3` em `optionalDependencies` e `sql.js` como dependência padrão. Não há dependência de cliente MongoDB instalada. | `package.json:dependencies`, `CLAUDE.md:persistency` | É necessário adicionar o driver oficial `mongodb` às dependências do projeto. | confirmed |
| D7 | `.env.example`, `docs/ARCHITECTURE.md` | Variáveis de ambiente atuais controlam `DATA_DIR`, `PORT`, autenticação e flags de log; não há variável para string de conexão de banco (`MONGODB_URI` / `DATABASE_URL`). | `.env.example:7`, `docs/ARCHITECTURE.md:535-539` | Necessário introduzir especificação de configuração de conexão MongoDB via env vars. | confirmed |

## Intent Classification

- User intent: end-to-end feature (Substituição arquitetural e funcional da camada de persistência de dados do sistema por MongoDB).
- Rationale: A substituição do banco afeta a infraestrutura de conexão, todos os 13 repositórios de dados, inicialização da aplicação, scripts de backup/migração, gerenciamento de índices e variáveis de ambiente.
- Coverage expectation: full end-to-end contract (Camada de dados, repositórios, compatibilidade com APIs de consumo, migração de dados e validação de persistência).

## Actors and Flows

- Actors/systems affected:
  - Sistema 9Router (Next.js server / gateway de rotas `/v1/*` e APIs do dashboard `/api/*`).
  - Operadores/Usuários do 9Router (configuração de conexões de provedores, chaves de API, combos de modelos, visualização de métricas e logs).
  - Instância do MongoDB (servidor local em contêiner ou cluster remoto como MongoDB Atlas).
- Current flow:
  - Ao iniciar, `driver.js` seleciona um driver SQLite disponível, abre o arquivo `data.sqlite` e executa migrações (`migrate.js`) [D1, D5].
  - Handlers de API e SSE chamam funções de repositório (`src/lib/db/repos/*`) que executam queries SQL e manipulam objetos serializados em colunas JSON (`stringifyJson`/`parseJson`) [D2, D4].
  - Consultas e mutações são sincronizadas no arquivo SQLite local com índices B-tree convencionais [D1, D4].
- Target flow:
  - Ao iniciar, o módulo gerenciador de banco estabelece e mantém um pool de conexões com o MongoDB através do driver oficial `mongodb` utilizando a URI configurada [D6, D7].
  - O sistema assegura a criação idempotente de coleções e índices essenciais (incluindo índices compostos para busca e TTL indexes para dados com expiração automática como `sessionAffinity`) [D4].
  - Handlers de API e o gateway interagem com repositórios que executam operações nativas no MongoDB (`find`, `findOne`, `updateOne`, `insertOne`, `bulkWrite`), persistindo documentos estruturados nativamente sem serialização manual desnecessária [D2, D4].
  - Operações de leitura/escrita mantêm o mesmo contrato público dos repositórios existentes, assegurando total transparência para o restante da aplicação [D3].

## Scope

- Definição do cliente de conexão MongoDB (`MongoClient`), pool de conexões singleton e tratamento de reconexão/graceful shutdown.
- Configuração de conexão via variáveis de ambiente (`MONGODB_URI`, `MONGODB_DB_NAME`).
- Implementação de repositórios MongoDB correspondentes a todas as entidades do sistema:
  - Configurações globais (`settings`)
  - Conexões de provedores de IA (`providerConnections`)
  - Nodes de provedores (`providerNodes`)
  - Pools de proxy (`proxyPools`)
  - Chaves de API (`apiKeys`)
  - Combos de modelos (`combos`)
  - Armazenamento chave-valor genérico para aliases, modelos customizados, mitm aliases, modelos desabilitados e precificação (`kv` ou coleções dedicadas `modelAliases`, `customModels`, `mitmAlias`, `disabledModels`, `pricing`)
  - Histórico de uso e métricas diárias (`usageHistory`, `usageDaily`)
  - Logs detalhados de requisições (`requestDetails`)
  - Afinidades de sessão e de combo (`sessionAffinity`, `comboAffinity`)
- Definição de índices para coleções (índices únicos em identificadores/nomes, índices de busca por provedor/modelo, índices temporais para logs e TTL indexes para afinidades).
- Adaptação das rotas de exportação e importação de banco (`exportDb`, `importDb`) para formato compatível.
- Estratégia de migração inicial / importação de dados a partir do formato existente.

## Scope Size Estimate

- New surfaces beyond the literal request: 0 (substituição direta dos 13 repositórios e driver de persistência sem criação de novas telas, rotas de negócio ou workflows adicionais).
- Estimated files: product: ~18, tests: ~10, docs/CI: 2
- Estimated lines: product: ~2200, tests: ~1200
- Vs literal request: same magnitude
- User confirmed expansion: yes — escopo restrito estritamente à persistência solicitada.

## Out of Scope

- Alterações na lógica de tradução de protocolos e execução de streaming do motor `open-sse/`.
- Alterações em interfaces visuais do dashboard Next.js (páginas React).
- Implementação de suporte a outros bancos relacionais (PostgreSQL, MySQL).
- Migração de logs de arquivo plano (`~/.9router/log.txt`) que não fazem parte do banco estruturado.

## Questions and Decisions

- [C1] Q: Qual deve ser o modelo de coexistência entre MongoDB e SQLite?
  A: Substituição Total (Apenas MongoDB). O SQLite e seus adaptadores serão integralmente removidos da base de código; MONGODB_URI torna-se a fonte de persistência obrigatória. — origin: user
- [C2] Q: Como deve ser realizada a migração dos dados legados existentes (SQLite `data.sqlite` e backups JSON) para o MongoDB?
  A: Não migrar automaticamente no boot da aplicação. Criar um script dedicado de migração (ex: CLI / script utilitário) para importar dados existentes sob demanda. — origin: user
- [C3] Q: Qual biblioteca / driver de acesso ao MongoDB deve ser adotada para a implementação da camada de persistência?
  A: `mongoose` (ODM com Schemas flexíveis / `strict: false` onde necessário e Models estruturados). — origin: user
- [C4] Q: Como as coleções de alta volumetria e dados efêmeros (`usageHistory`, `requestDetails`, `sessionAffinity`, `comboAffinity`) devem ser estruturadas no MongoDB?
  A: Coleções Mongoose com índices dedicados e TTL Indexes nativos (`expireAfterSeconds`) para expiração automática de afinidades. — origin: decision
- [C5] Q: Em ambientes MongoDB single-node (instâncias locais sem replica set ativado), como devemos tratar a atomicidade nas operações dos repositórios?
  A: Utilizar operações atômicas nativas por documento (`findOneAndUpdate`, `updateOne` com `$set`, `$inc`, `bulkWrite`, upserts) como padrão, assegurando compatibilidade com standalone, Docker e replica sets. — origin: user

## Requirements Traceability

| Need | Requirement (EARS) | Acceptance criterion (Given/When/Then) | Validation surface | Basis | Status |
|---|---|---|---|---|---|
| Conexão MongoDB | The system must establish and maintain a connection pool to MongoDB when initialized with valid connection settings. | Given valid `MONGODB_URI` in configuration, When the application starts, Then a connection pool to MongoDB is established successfully And database operations are functional. | backend | D1, D6, D7 | defined |
| Persistência de Configurações | When settings are updated, the system must atomically persist and retrieve settings in the `settings` collection. | Given a settings update payload, When `updateSettings()` is called, Then the document in MongoDB is updated atomically And subsequent `getSettings()` returns the merged values. | backend | D2, D4 | defined |
| Persistência de Conexões de Provedores | When provider connections are created, modified, or reordered, the system must store and query connection documents with provider, priority, and credentials in the `providerConnections` collection. | Given provider connection data with OAuth tokens or API keys, When `createProviderConnection()` or `updateProviderConnection()` is invoked, Then the connection document is saved in MongoDB with its priority and metadata And is retrievable by `getProviderConnections()`. | backend | D2, D4 | defined |
| Persistência de Chaves de API e Combos | The system must maintain unique constraints on API keys and combo names in MongoDB. | Given an existing API key or combo name, When a duplicate entry creation is attempted, Then the operation rejects or handles the conflict according to the domain contract without corrupting data. | backend | D2, D4 | defined |
| Métricas de Uso e Observabilidade | When a request completes, the system must record token usage in `usageHistory`, aggregate in `usageDaily`, and persist request details in `requestDetails`. | Given a completed AI request with token metrics, When `saveRequestUsage()` and `saveRequestDetail()` are called, Then the corresponding documents are inserted in MongoDB with correct timestamps and queried by usage stats endpoints. | backend | D2, D4 | defined |
| Afinidade de Sessão com Expiração | While session or combo affinity entries exist, the system must store cache keys and respect time-to-live expiration. | Given a session affinity entry with TTL, When queried within TTL, Then the mapped connection is returned; When TTL expires, Then the entry is removed or ignored. | backend | D2, D4 | defined |
| Exportação e Importação de Dados | When `exportDb()` or `importDb()` is executed, the system must export and import complete database snapshots compatible with the 9Router JSON backup contract. | Given a valid backup JSON object, When `importDb()` is executed on MongoDB, Then all collections are populated and `exportDb()` returns an identical structure. | backend | D2, D5 | defined |

## Contract and Persistence

- Changed contracts:
  - Internal DB adapter driver layer: substituição da interface de driver SQLite (`exec`, `get`, `all`, `run`, `transaction`) por interface de conexão e repositórios diretos em MongoDB (`db.collection(...)`).
  - Variáveis de ambiente: adição de `MONGODB_URI` (ex: `mongodb://localhost:27017/9router`) e opcionalmente `MONGODB_DB_NAME`.
  - Contratos públicos de repositório (`src/lib/db/index.js`, `src/lib/localDb.js`): 100% retrocompatíveis com os métodos e assinaturas existentes consumidos pelas rotas Next.js e motor `open-sse`.
- Persistence:
  - Coleções MongoDB:
    - `_meta`: Metadados do sistema, versão de esquema, contadores de vida útil (`key`, `value`, `updatedAt`).
    - `settings`: Configuração única global (`_id: "global"`, campos de configuração).
    - `providerConnections`: Conexões com provedores upstream (`_id` UUID, `provider`, `authType`, `name`, `email`, `priority`, `isActive`, `data`, `createdAt`, `updatedAt`).
    - `providerNodes`: Nodes de provedores (`_id`, `type`, `name`, `data`, `createdAt`, `updatedAt`).
    - `proxyPools`: Configurações de proxies upstream (`_id`, `name`, `proxyUrl`, `isActive`, `testStatus`, `createdAt`, `updatedAt`).
    - `apiKeys`: Chaves de acesso ao gateway (`_id`, `key` UNIQUE, `name`, `machineId`, `isActive`, `createdAt`).
    - `combos`: Definições de fallback/combos (`_id`, `name` UNIQUE, `kind`, `models`, `createdAt`, `updatedAt`).
    - `kv`: Armazenamento flexível chave-valor indexado por `scope` e `key` (`scope`, `key`, `value`, `updatedAt`).
    - `usageHistory`: Histórico de requisições de uso (`timestamp`, `provider`, `model`, `connectionId`, `apiKey`, `endpoint`, `promptTokens`, `completionTokens`, `cost`, `status`, `tokens`, `meta`).
    - `usageDaily`: Sumários agregados diários (`dateKey` UNIQUE, `requests`, `promptTokens`, `completionTokens`, `cost`, `byProvider`, `byModel`, `byAccount`, `byApiKey`, `byEndpoint`).
    - `requestDetails`: Logs de observabilidade com payloads de requisição/resposta (`_id` UUID, `timestamp`, `provider`, `model`, `connectionId`, `status`, `data`).
    - `sessionAffinity`: Afinidade de sessão para round-robin (`provider`, `model`, `cacheKeyHash`, `rawKey`, `connectionId`, `updatedAt`, `hitCount`).
    - `comboAffinity`: Afinidade de combos (`comboName`, `cacheKeyHash`, `rawKey`, `selectedModel`, `updatedAt`, `hitCount`).
- Validation surfaces: backend (testes de repositório vitest, testes de rotas Next.js, testes de concorrência e integridade de dados).
- Ambiguities: pending decision on C1..C5.

## Shared Contract

- Status: none
- Payloads/fields: none
- States and errors: none
- Minimum sequence: none
- Basis: Refatoração puramente de camada de dados interna do backend sem criação de novas interfaces de comunicação frontend/backend.

## Acceptance Criteria

- Given a valid MongoDB connection string, When 9Router boots, Then the application connects to MongoDB, initializes necessary collections/indexes, and serves API requests without errors.
- Given an existing provider connection, When an update occurs concurrently with OAuth token refresh, Then the document is updated atomically in MongoDB without data loss.
- Given a usage record from an AI chat request, When saved to the database, Then it is queryable via `/api/usage` and correctly reflected in daily summaries.
- Given an active session affinity entry in MongoDB, When the TTL period elapses, Then the TTL index or expiration logic evicts the entry so subsequent requests re-balance.
- Given a complete database JSON export from an earlier version, When passed to `importDb()`, Then all collections are accurately populated and functional.

## Clarifications Needed

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
