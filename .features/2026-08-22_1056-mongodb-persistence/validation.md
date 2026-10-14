# Substituição do SQLite por MongoDB na Persistência de Dados — Plano e Progresso de Validação

Status: ready
Spec: ./spec.md
Plan: ./plan.md
Updated: 2026-08-22 15:07
Guardian: approved

> `Validation Plan` formulado **antes** de qualquer validação; `Validation Progress` item a item.
> Nenhuma validação foi executada até a data/hora acima; todos os itens estão `pending`.

## Validation Plan

Itens `V#` derivados do Impact Map e das tasks do `plan.md`, cobrindo **todas** as alterações da feature. Cada item vincula requisito/acceptance criterion da spec (R#), método/comandos concretos, evidência esperada (saída observável + exit code) e a fase/task que produz a evidência.

### V1 — Mongoose Dependency & Connection Lifecycle
- **Descrição:** Valida a instalação da dependência `mongoose` (^8.x) e a instanciação do singleton de conexão em `src/lib/db/connection.js`, suportando pool de conexões, timeouts de conexão, caching em `global._mongooseConnection` para hot-reload do Next.js e desconexão graciosa.
- **Requisito/AC:** R1 (Conexão MongoDB: Given valid `MONGODB_URI` in configuration, When the application starts, Then a connection pool to MongoDB is established successfully And database operations are functional)
- **Método/comandos:**
  - `node -e "import('mongoose').then(m => console.log('Mongoose version:', m.default.version))"`
  - `npm --prefix tests test -- unit/db-models.test.js`
- **Evidência esperada:** Mongoose version 8.x no console (exit code 0) e suíte unitária de ciclo de vida de conexão com status PASS (exit code 0).
- **Fase/task produtora:** Phase 1 / Task 1.1

### V2 — Mongoose Schemas, Indexes & TTL Configuration
- **Descrição:** Valida a compilação e exportação de todos os 13 Schemas e Models Mongoose (`Setting`, `ProviderConnection`, `ProviderNode`, `ProxyPool`, `ApiKey`, `Combo`, `KvEntry`, `UsageHistory`, `UsageDaily`, `RequestDetail`, `SessionAffinity`, `ComboAffinity`, `Meta`), verificando restrições de unicidade (`apiKeys.key`, `combos.name`, `usageDaily.dateKey`, `_meta.key`, `kv.{scope, key}`) e índices TTL automáticos em `sessionAffinity` e `comboAffinity` (`updatedAt: 1`, `expireAfterSeconds: 1800`).
- **Requisito/AC:** R4 (Persistência de Chaves de API e Combos), R6 (Afinidade de Sessão com Expiração: Given an active session affinity entry in MongoDB, When the TTL period elapses, Then the TTL index or expiration logic evicts the entry)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-models.test.js`
- **Evidência esperada:** Todos os testes de definição de schema, índices compostos e configuração de TTL passando com status PASS (exit code 0).
- **Fase/task produtora:** Phase 1 / Tasks 1.2, 1.3

### V3 — Global Settings & Scoped Key-Value Storage
- **Descrição:** Valida o comportamento do repositório `settingsRepo.js` com persistência singleton (`_id: "global"`), mesclagem de defaults e atualizações atômicas via `findOneAndUpdate`, bem como os repositórios KV (`aliasRepo.js`, `pricingRepo.js`, `disabledModelsRepo.js`, `helpers/kvStore.js`) para manipulação de aliases, modelos customizados, mitm aliases e tabelas de precificação.
- **Requisito/AC:** R2 (Persistência de Configurações: Given a settings update payload, When updateSettings() is called, Then the document in MongoDB is updated atomically And subsequent getSettings() returns the merged values)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-settings.test.js`
- **Evidência esperada:** Testes unitários validando CRUD de settings, atomicidade de update sem overwrite de campos não informados, e persistência escopada em KV com status PASS (exit code 0).
- **Fase/task produtora:** Phase 2 / Task 2.1

### V4 — Core Domain Entities Repositories (Connections, Nodes, Proxies, Keys, Combos)
- **Descrição:** Valida a camada de persistência para conexões de provedores (incluindo atualização atômica de tokens OAuth e reordenação por prioridade), nós de provedores, pools de proxy, chaves de API (com validação e unicidade) e combos de modelos (com integridade de nomes).
- **Requisito/AC:** R3 (Persistência de Conexões de Provedores: Given provider connection data with OAuth tokens or API keys, When createProviderConnection() or updateProviderConnection() is invoked, Then the connection document is saved in MongoDB with its priority and metadata And is retrievable by getProviderConnections()), R4 (Persistência de Chaves de API e Combos)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-connections.test.js`
  - `npm --prefix tests test -- unit/db-core-repos.test.js`
- **Evidência esperada:** Asserções de CRUD, unicidade de chave/nome, filtros de busca por `isActive`/`provider` e atomicidade de updates retornando POJOs (`.lean()`) com status PASS (exit code 0).
- **Fase/task produtora:** Phase 2 / Task 2.2

### V5 — Telemetry, Token Metrics & Realtime Aggregation
- **Descrição:** Valida o repositório `usageRepo.js`, garantindo inserção de registros em `usageHistory`, agregação atômica in-place via `$inc` em `usageDaily` (requisições, promptTokens, completionTokens, custos por provedor/modelo/conta), consultas de gráficos (`getChartData`), estatísticas consolidadas (`getUsageStats`) e emissão de eventos SSE através de `statsEmitter`.
- **Requisito/AC:** R5 (Métricas de Uso e Observabilidade: Given a completed AI request with token metrics, When saveRequestUsage() and saveRequestDetail() are called, Then the corresponding documents are inserted in MongoDB with correct timestamps and queried by usage stats endpoints)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-usage.test.js`
- **Evidência esperada:** Testes unitários e de incremento concorrente de métricas diárias sem race conditions e retorno formatado de séries temporais com status PASS (exit code 0).
- **Fase/task produtora:** Phase 3 / Task 3.1

### V6 — Request Details Observability Buffering & Batch Flush
- **Descrição:** Valida `requestDetailsRepo.js` quanto ao enfileiramento não bloqueante em `writeBuffer`, flush assíncrono em lote via `RequestDetail.insertMany(..., { ordered: false })`, limites de salvaguarda de memória sob alta carga e consultas paginadas/filtradas (`getRequestDetails`, `getRequestDetailById`, `getDistinctProviders`).
- **Requisito/AC:** R5 (Métricas de Uso e Observabilidade)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-request-details.test.js`
- **Evidência esperada:** Teste de buffering com flush periódico e asserção de inserção em massa no MongoDB com status PASS (exit code 0).
- **Fase/task produtora:** Phase 3 / Task 3.2

### V7 — Session and Combo Affinity Round-Robin with TTL
- **Descrição:** Valida a persistência e resolução de afinidade de sessão (`sessionAffinityRepo.js`) e afinidade de combos (`comboAffinityRepo.js`), incluindo operações de upsert atômico, incremento de `hitCount`, atualização de timestamp e delegação de expiração para o motor MongoDB.
- **Requisito/AC:** R6 (Afinidade de Sessão com Expiração: Given a session affinity entry with TTL, When queried within TTL, Then the mapped connection is returned; When TTL expires, Then the entry is removed or ignored)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-affinity.test.js`
- **Evidência esperada:** Testes de set/get/touch de afinidade de sessão e combo com status PASS (exit code 0).
- **Fase/task produtora:** Phase 3 / Task 3.3

### V8 — Snapshot Export/Import & Public DB Interface Full Fidelity
- **Descrição:** Valida o contrato das funções `exportDb()` e `importDb(payload)` em `src/lib/db/index.js`, garantindo que um snapshot JSON exportado possa ser reimportado integralmente em uma base MongoDB limpa, preservando todos os dados, configurações, conexões e chaves, com compatibilidade de formato JSON de backups anteriores.
- **Requisito/AC:** R7 (Exportação e Importação de Dados: Given a valid backup JSON object, When importDb() is executed on MongoDB, Then all collections are populated and exportDb() returns an identical structure)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-export-import.test.js`
- **Evidência esperada:** Teste de roundtrip `exportDb -> clearDb -> importDb -> exportDb` com asserção de igualdade estrutural profunda (`toStrictEqual`) e status PASS (exit code 0).
- **Fase/task produtora:** Phase 4 / Task 4.1

### V9 — Standalone SQLite to MongoDB Migration CLI
- **Descrição:** Valida o script utilitário `scripts/migrate-sqlite-to-mongo.mjs`, assegurando a capacidade de ler um arquivo SQLite legado (`data.sqlite`) ou fixture SQLite, converter os registros relacionais/JSON para documentos MongoDB nativos e reportar sumário detalhado de migração sem erros.
- **Requisito/AC:** R7 (Exportação e Importação de Dados / Decisão C2: script utilitário offline dedicado para migração de dados sob demanda)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-migration-script.test.js`
- **Evidência esperada:** Teste de execução do script contra banco SQLite de fixture validando migração correta de todas as tabelas para coleções MongoDB com status PASS (exit code 0).
- **Fase/task produtora:** Phase 4 / Task 4.2

### V10 — Full SQLite Teardown, Cleanups & Next.js Build Integrity
- **Descrição:** Valida a remoção completa do código legado de SQLite (`src/lib/db/adapters/*`, `src/lib/db/migrations/*`, `src/lib/db/schema.js`, `better-sqlite3`, `sql.js`), garantindo que não restem referências quebradas e que o build de produção do Next.js compile com sucesso.
- **Requisito/AC:** R1 (Conexão MongoDB / Decisão C1: Substituição Total Apenas MongoDB)
- **Método/comandos:**
  - `npm run build`
- **Evidência esperada:** Next.js build concluído com sucesso (`Compiled successfully` / standalone output gerado) com exit code 0.
- **Fase/task produtora:** Phase 5 / Task 5.1

### V11 — Comprehensive End-to-End Persistence Regression Suite
- **Descrição:** Valida a suíte de testes de ponta a ponta em MongoDB (`tests/unit/db-mongo-e2e.test.js`), simulando fluxos de concorrência, operações simultâneas de streaming com registro de tokens, e executa a suíte de testes unitários do 9Router para garantir zero regressões na aplicação.
- **Requisito/AC:** R1, R2, R3, R4, R5, R6, R7 (Cobertura ponta a ponta de persistência)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-mongo-e2e.test.js`
- **Evidência esperada:** Testes E2E executados com sucesso com status PASS (exit code 0).
- **Fase/task produtora:** Phase 5 / Task 5.2

## Validation Progress

Um registro por item `V#`. O **manager de execução** (`batista-execute`) atualiza `Status`/`Evidência produzida` a partir de relatórios do worker e veredictos do `workflow-validator`; o **`workflow-validator`** confere cada item (status + evidência) com aprovação positiva explícita antes de qualquer `pass`.

| Item | Status | Evidência produzida | Conferido pelo workflow-validator |
| V1 — Mongoose Dependency & Connection Lifecycle | pass | Mongoose 8.24.4 instalado e verificado; src/lib/db/connection.js implementado com singleton global, pool e timeouts. | conferido |
| V2 — Mongoose Schemas, Indexes & TTL Configuration | pass | 13 Models Mongoose criados e validados; 23 testes unitários passando em tests/unit/db-models.test.js cobrindo índices compostos, únicos e TTL. | conferido |
| V3 — Global Settings & Scoped Key-Value Storage | pass | settingsRepo e helpers/kvStore refatorados para Mongoose com operações atômicas; testes unitários em tests/unit/db-settings.test.js passando. | conferido |
| V4 — Core Domain Entities Repositories | pass | connectionsRepo, nodesRepo, proxyPoolsRepo, apiKeysRepo, combosRepo refatorados para Mongoose com POJOs (.lean()); testes unitários passando em db-connections.test.js e db-core-repos.test.js. | conferido |
| V5 — Telemetry, Token Metrics & Realtime Aggregation | pass | usageRepo refatorado com UsageDaily ($inc in-place) e UsageHistory; testes em tests/unit/db-usage.test.js passando com exit code 0. | conferido |
| V6 — Request Details Observability Buffering & Batch Flush | pass | requestDetailsRepo refatorado com buffer em lote assíncrono e bulkWrite upsert atômico para capturar atualizações finais de stream; testes unitários passando. | conferido |
| V7 — Session and Combo Affinity Round-Robin with TTL | pass | sessionAffinityRepo e comboAffinityRepo refatorados com delegação para TTL index Mongoose; testes em tests/unit/db-affinity.test.js passando. | conferido |
| V8 — Snapshot Export/Import & Public DB Interface Full Fidelity | pass | exportDb e importDb reimplementados em src/lib/db/index.js com Mongoose; 5 testes em tests/unit/db-export-import.test.js passando. | conferido |
| V9 — Standalone SQLite to MongoDB Migration CLI | pass | scripts/migrate-sqlite-to-mongo.mjs implementado e testado em tests/unit/db-migration-script.test.js com fixture SQLite/JSON passando. | conferido |
| V10 — Full SQLite Teardown, Cleanups & Next.js Build Integrity | pass | SQLite adapters, schemas, migrations e dependências legadas removidos; npm run build executado com sucesso (exit code 0). | conferido |
| V11 — Comprehensive End-to-End Persistence Regression Suite | pass | 10 suítes de teste de banco executadas (93 testes passando, 0 falhas) em tests/unit/db-*.test.js; validação completa de ponta a ponta. | conferido |

## Regras de Promoção e Invalidação

- **Promoção:** um item só vira `pass` com evidência prática registrada (saída observável + exit code) e conferência positiva item a item do `workflow-validator`.
- **Bloqueio:** itens `pending`/`fail` bloqueiam `converged` (Root Completion Gate do loop) e merge; item `fail` dispara correção via worker e revalidação.
- **Cascata (C2/D6):** mudança substantiva em `spec.md` ou `plan.md` rebaixa este documento para `draft` e o guardian para `pending`, e **todos** os itens `pass` anteriores voltam a `pending` (evidência antiga deixa de contar; aprovação vale só para a revisão lida) até revalidação.
- **Atualização:** a cada mudança de status/evidência, atualiza `Updated:` no cabeçalho e reflete no `Validation Progress`.
- **Limite de escrita:** este arquivo é editado somente pelo manager de execução/loop (allowlist); nunca entra em write set de workers paralelos (arquivo único compartilhado).
