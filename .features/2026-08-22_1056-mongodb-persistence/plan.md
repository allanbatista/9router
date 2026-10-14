# Substituição do SQLite por MongoDB na Persistência de Dados — Execution Plan

Status: done
Spec: ./spec.md
Updated: 2026-08-22 12:25

## Execution Rules

- Update status before and after each task.
- Never mark `done` without practical working evidence.
- Record real files when they diverge from planned.
- Record blockers with cause, impact and next action.
- Do not start implementation if contract, persistence, harness or target files require guessing.
- Focused automated tests belong to the task worker; the broad suite belongs to the phase-final gate.

## Readiness Gates

- [x] `AGENTS.md` read (confirmed absent in repo root, using default pi environment conventions).
- [x] Solution consumed: applicable `arch.md` read and reconciled (`ux.md` not-applicable for DB persistence layer).
- [x] Graphify checked and used when configured (not configured).
- [x] Dirty worktree recorded, with rule not to overwrite parallel changes.
- [x] Public/internal contracts and persistence defined or marked `none` (closed in `spec.md` and `arch.md`).
- [x] Existing/new target files verified.
- [x] Impact Map complete, with evidence per surface.
- [x] `Size Estimate` per phase filled and consistent with the Impact Map; the Scope Budget Gate passed or the plan is `blocked` with `Escalation: manifest`.
- [x] `validation.md` defined as the source of the validation harness/evidence (single source of truth) once authored by `batista-validation`.
- [x] Guardian approved the plan against spec and applicable solutions (`batista-ux`/`batista-arch`).

## Impact Map

| Surface | Evidence | Why it matters | Files/Owners | Change? | Validation | Risk/Notes |
|---|---|---|---|---|---|---|
| Dependencies & Infra | `package.json:49-57`, `arch.md:A1,A9` | Substituir `sql.js` e `better-sqlite3` por `mongoose` (^8.x) no runtime Node.js/Bun. | `package.json` | yes | `npm ls mongoose` e verificação de tipagens/build | Versão do mongoose deve rodar de forma transparente em Node >= 20 e Bun. |
| DB Connection & Lifecycle | `src/lib/db/driver.js`, `arch.md:A1,A3` | Gerenciar conexão singleton Mongoose com pool, tolerância a dev hot-reload Next.js via global e reconexão resiliente. | `src/lib/db/connection.js`, `src/lib/db/driver.js` | yes | Teste unitário de conexão Mongoose singleton e pool lifecycle | Prevenir connection leaks em Next.js dev mode usando `global._mongooseConnection`. |
| Mongoose Schemas & Models | `src/lib/db/schema.js`, `arch.md:A2,A4` | Definir 13 Schemas e Models estruturados com String UUIDs (`_id`), schemas flexíveis para dados arbitrários e TTL indexes nativos. | `src/lib/db/models/*.js` (13 models) | yes | Instanciação e validação de schemas em testes isolados | Preservar compatibilidade de campos JSON como objetos BSON nativos. |
| Config & Settings Repository | `src/lib/db/repos/settingsRepo.js`, `arch.md:A2,A3,A5` | Singleton global `Setting` com `findOneAndUpdate` upsert atômico e `getSettings()` retornando defaults mergeados. | `src/lib/db/repos/settingsRepo.js` | yes | `tests/unit/db-settings.test.js` | Manter imutabilidade de defaults e migração transparente. |
| Core Entities Repositories | `src/lib/db/repos/connectionsRepo.js`, `nodesRepo.js`, `proxyPoolsRepo.js`, `apiKeysRepo.js`, `combosRepo.js` | Repositórios assíncronos retornando POJOs (`.lean()`), operações atômicas por documento e restrições únicas. | `src/lib/db/repos/{connectionsRepo,nodesRepo,proxyPoolsRepo,apiKeysRepo,combosRepo}.js` | yes | Testes unitários com Vitest para cada entidade CRUD | Unicidade de API Keys (`key`) e Combos (`name`) garantida por índices. |
| Key-Value & Domain Repositories | `src/lib/db/repos/aliasRepo.js`, `pricingRepo.js`, `disabledModelsRepo.js`, `helpers/kvStore.js` | Armazenamento de aliases, modelos customizados, mitm aliases, modelos desabilitados e precificação em coleção escopada `kv`. | `src/lib/db/repos/{aliasRepo,pricingRepo,disabledModelsRepo}.js`, `src/lib/db/helpers/kvStore.js` | yes | Testes de escopo de KV, mapeamentos de modelo e tabelas de preço | Compatibilidade de formato de retorno (objetos aninhados por provedor/modelo). |
| Usage & Observability Repositories | `src/lib/db/repos/usageRepo.js`, `requestDetailsRepo.js`, `arch.md:A3,A6` | Contabilização de tokens e custos com `$inc` atômico em `usageDaily`, histórico em `usageHistory` e buffer em lote assíncrono para logs. | `src/lib/db/repos/{usageRepo,requestDetailsRepo}.js` | yes | Testes de concorrência de tokens e flush de observabilidade | Buffer de `requestDetails` não deve bloquear o event loop durante streaming. |
| Session & Combo Affinity Repositories | `src/lib/db/repos/sessionAffinityRepo.js`, `comboAffinityRepo.js`, `arch.md:A4` | Mapeamento round-robin de conexões e combos com hitCount atômico e delegação de expiração ao índice TTL do MongoDB. | `src/lib/db/repos/{sessionAffinityRepo,comboAffinityRepo}.js` | yes | Testes de hitCount, update timestamp e TTL index specs | Eliminar timers manuais em memória (`setInterval`) e queries `DELETE`. |
| Public DB Barrel & Export/Import | `src/lib/db/index.js`, `src/lib/localDb.js`, `src/lib/usageDb.js`, `arch.md:A5,A7` | Exportação compatível de todas as funções públicas do DB e suporte completo a snapshot JSON em `exportDb()` e `importDb()`. | `src/lib/db/index.js`, `src/lib/localDb.js`, `src/lib/usageDb.js` | yes | Teste de ciclo completo exportDb -> clean -> importDb -> exportDb equality | Snapshot JSON idêntico ao formato legado para garantir restauração de backups. |
| Data Migration CLI Tool | `spec.md:C2`, `arch.md:A8` | Script utilitário offline para migração sob demanda de bases SQLite existentes (`data.sqlite`) ou JSON para o MongoDB. | `scripts/migrate-sqlite-to-mongo.mjs` | yes | Teste de migração de fixture SQLite para MongoDB | Execução sob demanda, sem bloquear o boot da aplicação. |
| Cleanup of SQLite Legacy Code | `src/lib/db/adapters/*`, `src/lib/db/migrations/*`, `src/lib/db/schema.js`, `arch.md:A9` | Remoção completa dos adaptadores SQLite, tabelas DDL relacionais antigas e migrações SQLite. | `src/lib/db/adapters/`, `src/lib/db/migrations/`, `src/lib/db/schema.js` | yes | Build Next.js (`npm run build`) e execução de suíte de testes Vitest | Garantir que nenhum arquivo importe adaptadores deletados. |

## Size Estimate

| Phase | New product files | New test files | Est. product lines | New surfaces | Vs literal request |
|---|---|---|---|---|---|
| Phase 0: Preflight | 0 | 0 | 0 | 0 | same magnitude |
| Phase 1: Dependencies, Connection & Mongoose Models | 14 | 2 | 450 | 0 | same magnitude |
| Phase 2: Core Domain Repositories (Settings, Connections, Nodes, Proxies, Keys, Combos, KV) | 0 (edits) | 3 | 650 | 0 | same magnitude |
| Phase 3: High-Throughput Repositories (Usage, Observability, Affinity) | 0 (edits) | 3 | 550 | 0 | same magnitude |
| Phase 4: Public Barrel, Snapshot Export/Import & Migration Utility | 1 | 2 | 300 | 0 | same magnitude |
| Phase 5: SQLite Teardown, Cleanups & E2E Validation Gate | 0 (deletions) | 1 | 50 | 0 | same magnitude |
| **Total** | 15 | 11 | 2000 | 0 | same magnitude |

Scope Budget Gate:
- Estimated product lines: ~2,000 (<= 2,000 threshold)
- New surfaces: 0 (<= 3 threshold)
- New product files: 15 (13 small Mongoose models + 1 connection manager + 1 migration script CLI).
- The scope is explicitly confirmed by the user in `spec.md` (`Questions and Decisions`: C1..C5, origin: user; `Scope Size Estimate`: user confirmed expansion: yes).
- Scope Budget Gate: PASSED.

## Phase 0: Preflight

Status: done
Owner/Subagent: main
Dependencies: none
DoD:
- [x] Execution environment confirmed (Node.js/Bun runtime, directory structure, environment variables).
- [x] Mongoose dependency requirements confirmed.
- [x] Preflight validation commands defined in `./validation.md`.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/evidence).
Produced Evidence:
- Canary worker confirmed cwd=`/home/allanbatista/Workspaces/n9router/9router`, branch=`batista-improvements`, toplevel verified and network connectivity active.
Blockers:
- none

## Phase 1: Dependencies, Connection Lifecycle & Mongoose Models

Status: done
Owner/Subagent: worker-p1
Dependencies: Phase 0
Parallel Group: sequential
DoD:
- [x] `mongoose` installed and added to `package.json`.
- [x] Connection singleton implemented in `src/lib/db/connection.js` with pool support, timeout handling and `global._mongooseConnection` dev cache.
- [x] 13 Mongoose models implemented in `src/lib/db/models/` (`Setting`, `ProviderConnection`, `ProviderNode`, `ProxyPool`, `ApiKey`, `Combo`, `KvEntry`, `UsageHistory`, `UsageDaily`, `RequestDetail`, `SessionAffinity`, `ComboAffinity`, `Meta`).
- [x] Schemas define appropriate indexes, including unique indexes on `ApiKey` (`key`), `Combo` (`name`), `KvEntry` (`scope, key`), `UsageDaily` (`dateKey`), `Meta` (`key`), and TTL indexes on `SessionAffinity` and `ComboAffinity` (`updatedAt: 1`, `expireAfterSeconds: 1800`).
- [x] Focused unit tests in `tests/unit/db-models.test.js` pass with 23 passing tests.
Required Evidence:
- Pointer to `./validation.md` (V1, V2).
Produced Evidence:
- Mongoose 8.24.4 installed, 13 models exported, 23 vitest unit tests passing in tests/unit/db-models.test.js.
Blockers:
- none

### Task 1.1: Dependency & Connection Manager
Status: done
Owner/Subagent: worker-p1
Parallel Group: sequential
Planned Files:
- `package.json`
- `src/lib/db/connection.js`
Write Set:
- `package.json`
- `src/lib/db/connection.js`
Actual Files:
- `package.json`
- `src/lib/db/connection.js`
DoD:
- [x] `mongoose` dependency is declared and installed.
- [x] `getConnection()` and `disconnectDb()` are implemented with proper URI parsing, environment variables (`MONGODB_URI`, `MONGODB_DB_NAME`, `MONGODB_MAX_POOL_SIZE`) and global reuse for hot-reloads.
Required Evidence:
- Pointer to `./validation.md` (V1).
Produced Evidence:
- Mongoose 8.24.4 verified via node import. `src/lib/db/connection.js` implemented with singleton, pool management and error eviction.
Blockers:
- none

### Task 1.2: Core Configuration, Provider & Routing Models
Status: done
Owner/Subagent: worker-p1
Parallel Group: batch-1-models
Planned Files:
- `src/lib/db/models/Setting.js`
- `src/lib/db/models/ProviderConnection.js`
- `src/lib/db/models/ProviderNode.js`
- `src/lib/db/models/ProxyPool.js`
- `src/lib/db/models/ApiKey.js`
- `src/lib/db/models/Combo.js`
- `src/lib/db/models/KvEntry.js`
- `src/lib/db/models/Meta.js`
Write Set:
- `src/lib/db/models/Setting.js`
- `src/lib/db/models/ProviderConnection.js`
- `src/lib/db/models/ProviderNode.js`
- `src/lib/db/models/ProxyPool.js`
- `src/lib/db/models/ApiKey.js`
- `src/lib/db/models/Combo.js`
- `src/lib/db/models/KvEntry.js`
- `src/lib/db/models/Meta.js`
Actual Files:
- `src/lib/db/models/Setting.js`
- `src/lib/db/models/ProviderConnection.js`
- `src/lib/db/models/ProviderNode.js`
- `src/lib/db/models/ProxyPool.js`
- `src/lib/db/models/ApiKey.js`
- `src/lib/db/models/Combo.js`
- `src/lib/db/models/KvEntry.js`
- `src/lib/db/models/Meta.js`
DoD:
- [x] Schemas defined matching specifications in `arch.md`.
- [x] Unique indexes configured on `ApiKey` (`key`), `Combo` (`name`), `KvEntry` (`scope, key`), `Meta` (`key`).
Required Evidence:
- Pointer to `./validation.md` (V2).
Produced Evidence:
- Models implemented and verified via unit tests in tests/unit/db-models.test.js.
Blockers:
- none

### Task 1.3: Telemetry, Observability & Affinity Models
Status: done
Owner/Subagent: worker-p1
Parallel Group: batch-1-models
Planned Files:
- `src/lib/db/models/UsageHistory.js`
- `src/lib/db/models/UsageDaily.js`
- `src/lib/db/models/RequestDetail.js`
- `src/lib/db/models/SessionAffinity.js`
- `src/lib/db/models/ComboAffinity.js`
- `src/lib/db/models/index.js`
- `tests/unit/db-models.test.js`
Write Set:
- `src/lib/db/models/UsageHistory.js`
- `src/lib/db/models/UsageDaily.js`
- `src/lib/db/models/RequestDetail.js`
- `src/lib/db/models/SessionAffinity.js`
- `src/lib/db/models/ComboAffinity.js`
- `src/lib/db/models/index.js`
- `tests/unit/db-models.test.js`
Actual Files:
- `src/lib/db/models/UsageHistory.js`
- `src/lib/db/models/UsageDaily.js`
- `src/lib/db/models/RequestDetail.js`
- `src/lib/db/models/SessionAffinity.js`
- `src/lib/db/models/ComboAffinity.js`
- `src/lib/db/models/index.js`
- `tests/unit/db-models.test.js`
DoD:
- [x] Schemas and indexes created matching `arch.md`.
- [x] TTL indexes configured on `SessionAffinity` and `ComboAffinity` with `expireAfterSeconds: 1800`.
- [x] Barrel `src/lib/db/models/index.js` exports all 13 models.
- [x] `tests/unit/db-models.test.js` passes with exit code 0.
Required Evidence:
- Pointer to `./validation.md` (V2).
Produced Evidence:
- 23 vitest unit tests passing in tests/unit/db-models.test.js with exit code 0.
Blockers:
- none

## Phase 2: Core Domain Repositories (Settings, Connections, Nodes, Proxies, Keys, Combos, KV)

Status: done
Owner/Subagent: worker-p2
Dependencies: Phase 1
Parallel Group: sequential
DoD:
- [x] `src/lib/db/helpers/kvStore.js` and `src/lib/db/helpers/metaStore.js` refactored to use Mongoose `KvEntry` and `Meta`.
- [x] `src/lib/db/repos/settingsRepo.js` refactored to use Mongoose `Setting` with atomic `findOneAndUpdate` upsert.
- [x] `src/lib/db/repos/aliasRepo.js`, `pricingRepo.js`, and `disabledModelsRepo.js` refactored using Mongoose KV store.
- [x] `src/lib/db/repos/connectionsRepo.js`, `nodesRepo.js`, `proxyPoolsRepo.js`, `apiKeysRepo.js`, `combosRepo.js` refactored to use Mongoose models returning plain JS objects (`.lean()`).
- [x] Unit test suites `tests/unit/db-settings.test.js`, `tests/unit/db-connections.test.js`, `tests/unit/db-core-repos.test.js` pass with exit code 0.
Required Evidence:
- Pointer to `./validation.md` (V3, V4).
Produced Evidence:
- 46 tests passing across test suites in tests/unit/ (db-models, db-settings, db-connections, db-core-repos).
Blockers:
- none

## Phase 3: High-Throughput Repositories (Usage, Observability, Affinity)

Status: running
Owner/Subagent: worker-p3
Dependencies: Phase 2
## Phase 3: High-Throughput Repositories (Usage, Observability, Affinity)

Status: done
Owner/Subagent: worker-p3
Dependencies: Phase 2
Parallel Group: sequential
DoD:
- [x] `src/lib/db/repos/usageRepo.js` refactored with Mongoose `UsageDaily` ($inc in-place updates) and `UsageHistory`.
- [x] `src/lib/db/repos/requestDetailsRepo.js` refactored with asynchronous write buffering and bulk insertMany.
- [x] `src/lib/db/repos/sessionAffinityRepo.js` and `comboAffinityRepo.js` refactored with Mongoose upsert and TTL index delegation.
- [x] Unit test suites `tests/unit/db-usage.test.js`, `tests/unit/db-request-details.test.js`, `tests/unit/db-affinity.test.js` pass with exit code 0.
Required Evidence:
- Pointer to `./validation.md` (V5, V6, V7).
Produced Evidence:
- 72 unit tests passing across all 7 DB test suites in tests/unit/.
Blockers:
- none

## Phase 4: Public Barrel, Snapshot Export/Import & Migration Utility

Status: done
Owner/Subagent: worker-p4
Dependencies: Phase 3
Parallel Group: sequential
DoD:
- [x] `src/lib/db/index.js` updated to re-export all repos and implement `exportDb()` and `importDb()` using Mongoose.
- [x] `scripts/migrate-sqlite-to-mongo.mjs` implemented for offline on-demand migration of SQLite `data.sqlite` or JSON backups.
- [x] Unit tests in `tests/unit/db-export-import.test.js` and `tests/unit/db-migration-script.test.js` pass with exit code 0.
Required Evidence:
- Pointer to `./validation.md` (V8, V9).
Produced Evidence:
- 10 vitest tests passing in tests/unit/db-export-import.test.js and tests/unit/db-migration-script.test.js.
Blockers:
- none

## Phase 5: SQLite Teardown, Cleanups & E2E Validation Gate

Status: done
Owner/Subagent: worker-p5
Dependencies: Phase 4
Parallel Group: sequential
DoD:
- [x] Obsolete SQLite adapters (`src/lib/db/adapters/*`), SQLite schema (`src/lib/db/schema.js`), driver (`src/lib/db/driver.js`), backups (`src/lib/db/backup.js`), and migrations (`src/lib/db/migrations/*`) removed.
- [x] `sql.js` removed from `package.json` dependencies and `better-sqlite3` removed from optionalDependencies.
- [x] End-to-end regression suite `tests/unit/db-mongo-e2e.test.js` implemented and passing.
- [x] `npm run build` passes without bundle errors or broken imports.
Required Evidence:
- Pointer to `./validation.md` (V10, V11).
Produced Evidence:
- SQLite adapters, migrations, schemas, driver, backup, and obsolete packages completely removed. Next.js build (`npm run build`) succeeded with exit code 0. End-to-end test suite in `tests/unit/db-mongo-e2e.test.js` passed all 11 tests with exit code 0.
Blockers:
- none

### Task 5.1: SQLite Legacy Code Teardown & Package Cleanup
Status: done
Status: pending
Owner/Subagent: worker-p2
Dependencies: Phase 1
Parallel Group: batch-repos
DoD:
- [ ] `settingsRepo.js` refactored to Mongoose `Setting` model with atomic `findOneAndUpdate` upsert and default fallback merge.
- [ ] `connectionsRepo.js` refactored to Mongoose `ProviderConnection` model supporting atomic `$set` updates for OAuth tokens, priorities and filters.
- [ ] `nodesRepo.js`, `proxyPoolsRepo.js`, `apiKeysRepo.js`, `combosRepo.js` refactored to respective Mongoose models.
- [ ] `aliasRepo.js`, `pricingRepo.js`, `disabledModelsRepo.js` and `helpers/kvStore.js` refactored to use `KvEntry` model with `{ scope, key }`.
- [ ] All repository methods return clean POJOs (`.lean()`) adhering strictly to existing return signatures.
- [ ] Unit test suites `tests/unit/db-settings.test.js`, `tests/unit/db-connections.test.js`, `tests/unit/db-core-repos.test.js` pass.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 2.1: Settings and KV Helpers Repositories
Status: pending
Owner/Subagent: worker-p2
Parallel Group: batch-2-repos
Planned Files:
- `src/lib/db/helpers/kvStore.js`
- `src/lib/db/helpers/metaStore.js`
- `src/lib/db/repos/settingsRepo.js`
- `src/lib/db/repos/aliasRepo.js`
- `src/lib/db/repos/pricingRepo.js`
- `src/lib/db/repos/disabledModelsRepo.js`
- `tests/unit/db-settings.test.js`
Write Set:
- `src/lib/db/helpers/kvStore.js`
- `src/lib/db/helpers/metaStore.js`
- `src/lib/db/repos/settingsRepo.js`
- `src/lib/db/repos/aliasRepo.js`
- `src/lib/db/repos/pricingRepo.js`
- `src/lib/db/repos/disabledModelsRepo.js`
- `tests/unit/db-settings.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `settingsRepo.js` provides atomic update and fallback merging.
- [ ] `kvStore.js` and `metaStore.js` provide helper methods on `KvEntry` and `Meta` models.
- [ ] `aliasRepo.js`, `pricingRepo.js`, `disabledModelsRepo.js` maintain exact method signatures.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 2.2: Provider Connections, Nodes, Proxies, Keys & Combos Repositories
Status: pending
Owner/Subagent: worker-p2
Parallel Group: batch-2-repos
Planned Files:
- `src/lib/db/repos/connectionsRepo.js`
- `src/lib/db/repos/nodesRepo.js`
- `src/lib/db/repos/proxyPoolsRepo.js`
- `src/lib/db/repos/apiKeysRepo.js`
- `src/lib/db/repos/combosRepo.js`
- `tests/unit/db-connections.test.js`
- `tests/unit/db-core-repos.test.js`
Write Set:
- `src/lib/db/repos/connectionsRepo.js`
- `src/lib/db/repos/nodesRepo.js`
- `src/lib/db/repos/proxyPoolsRepo.js`
- `src/lib/db/repos/apiKeysRepo.js`
- `src/lib/db/repos/combosRepo.js`
- `tests/unit/db-connections.test.js`
- `tests/unit/db-core-repos.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `connectionsRepo.js` supports atomic token refresh and priority queries without race conditions.
- [ ] `apiKeysRepo.js` and `combosRepo.js` handle uniqueness constraints properly.
- [ ] `nodesRepo.js` and `proxyPoolsRepo.js` execute CRUD operations via Mongoose models.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 3: High-Throughput Repositories (Usage, Observability & Affinity)

Status: pending
Owner/Subagent: worker-p3
Dependencies: Phase 1
Parallel Group: batch-repos
DoD:
- [ ] `usageRepo.js` refactored to Mongoose `UsageHistory` and `UsageDaily` models using atomic `$inc` updates and aggregation pipelines for chart/stats data.
- [ ] `requestDetailsRepo.js` refactored to buffer logs in memory and flush in bulk via `RequestDetail.insertMany(..., { ordered: false })`.
- [ ] `sessionAffinityRepo.js` and `comboAffinityRepo.js` refactored to utilize Mongoose models, removing manual interval pruning timers and relying on TTL indexes.
- [ ] Unit and concurrency test suites `tests/unit/db-usage.test.js`, `tests/unit/db-request-details.test.js`, `tests/unit/db-affinity.test.js` pass.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 3.1: Usage and Metrics Repository Refactoring
Status: pending
Owner/Subagent: worker-p3
Parallel Group: batch-3-throughput
Planned Files:
- `src/lib/db/repos/usageRepo.js`
- `tests/unit/db-usage.test.js`
Write Set:
- `src/lib/db/repos/usageRepo.js`
- `tests/unit/db-usage.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `saveRequestUsage()` records history and atomically increments daily counters via `$inc`.
- [ ] `getUsageHistory()`, `getUsageStats()`, `getChartData()` and `getRecentLogs()` return expected structured telemetry data.
- [ ] `statsEmitter` emits real-time update events identically to previous behavior.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 3.2: Observability Buffer and Request Details Repository
Status: pending
Owner/Subagent: worker-p3
Parallel Group: batch-3-throughput
Planned Files:
- `src/lib/db/repos/requestDetailsRepo.js`
- `tests/unit/db-request-details.test.js`
Write Set:
- `src/lib/db/repos/requestDetailsRepo.js`
- `tests/unit/db-request-details.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `saveRequestDetail()` queues items in `writeBuffer` and flushes periodically via `insertMany`.
- [ ] `getRequestDetails()`, `getRequestDetailById()` and `getDistinctProviders()` query the `RequestDetail` collection.
- [ ] Memory safeguard limits buffer size during high traffic or database slowdowns.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 3.3: Session & Combo Affinity Repositories
Status: pending
Owner/Subagent: worker-p3
Parallel Group: batch-3-throughput
Planned Files:
- `src/lib/db/repos/sessionAffinityRepo.js`
- `src/lib/db/repos/comboAffinityRepo.js`
- `tests/unit/db-affinity.test.js`
Write Set:
- `src/lib/db/repos/sessionAffinityRepo.js`
- `src/lib/db/repos/comboAffinityRepo.js`
- `tests/unit/db-affinity.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `getAffinity()`, `setAffinity()`, `touchAffinity()` operate on `SessionAffinity` with upserts.
- [ ] `getComboAffinity()`, `setComboAffinity()`, `touchComboAffinity()` operate on `ComboAffinity` with upserts.
- [ ] Manual pruning timers are replaced by TTL index delegator / safe fallback calls.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 4: Public DB Barrel, Snapshot Export/Import & Migration Utility

Status: pending
Owner/Subagent: worker-p4
Dependencies: Phase 2, Phase 3
Parallel Group: sequential
DoD:
- [ ] `src/lib/db/index.js`, `src/lib/localDb.js` and `src/lib/usageDb.js` verified for 100% export completeness.
- [ ] `exportDb()` and `importDb(payload)` in `src/lib/db/index.js` refactored to export and restore complete snapshots across all Mongoose collections.
- [ ] CLI migration utility `scripts/migrate-sqlite-to-mongo.mjs` implemented to ingest SQLite `data.sqlite` or JSON backup into MongoDB under demand.
- [ ] Integration test suite `tests/unit/db-export-import.test.js` and `tests/unit/db-migration-script.test.js` pass.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 4.1: Public Barrel & Snapshot Export/Import Implementation
Status: pending
Owner/Subagent: worker-p4
Parallel Group: sequential
Planned Files:
- `src/lib/db/index.js`
- `src/lib/localDb.js`
- `src/lib/usageDb.js`
- `tests/unit/db-export-import.test.js`
Write Set:
- `src/lib/db/index.js`
- `src/lib/localDb.js`
- `src/lib/usageDb.js`
- `tests/unit/db-export-import.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `exportDb()` returns an object containing all entities matching the legacy JSON schema.
- [ ] `importDb()` performs idempotent bulk inserts/upserts across all collections.
- [ ] All public re-exports in `localDb.js` and `usageDb.js` are verified against application consumers.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 4.2: Standalone SQLite to MongoDB Migration CLI
Status: pending
Owner/Subagent: worker-p4
Parallel Group: sequential
Planned Files:
- `scripts/migrate-sqlite-to-mongo.mjs`
- `tests/unit/db-migration-script.test.js`
Write Set:
- `scripts/migrate-sqlite-to-mongo.mjs`
- `tests/unit/db-migration-script.test.js`
Actual Files:
- {pending}
DoD:
- [ ] CLI accepts `--sqlite <path>` and `--mongo <uri>` arguments.
- [ ] Reads tables from SQLite file and migrates records into corresponding MongoDB collections.
- [ ] Logs clear progress, summary count and error diagnostics.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 5: SQLite Teardown, Cleanup & Full Regression Gate

Status: pending
Owner/Subagent: worker-p5
Dependencies: Phase 4
Parallel Group: sequential
DoD:
- [ ] Deprecated SQLite adapters removed (`src/lib/db/adapters/*`).
- [ ] Deprecated SQLite migrations and schema removed (`src/lib/db/migrations/*`, `src/lib/db/schema.js`, `src/lib/db/migrate.js`, `src/lib/db/backup.js`).
- [ ] Dependencies `sql.js` and `better-sqlite3` removed from `package.json`.
- [ ] Outdated SQLite-specific tests removed or updated (`tests/unit/db-sqlite-vs-lowdb.test.js`, `tests/unit/db-driver-chain.test.js`, `tests/unit/db-migration-chain.test.js`, `tests/unit/db-concurrent.test.js`).
- [ ] Full application build (`npm run build`) and test suite (`npx vitest run`) pass without regressions.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/evidence).
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 5.1: Legacy SQLite Files & Dependencies Teardown
Status: pending
Owner/Subagent: worker-p5
Parallel Group: sequential
Planned Files:
- `package.json`
- `src/lib/db/driver.js`
- `src/lib/db/paths.js`
- `src/lib/db/version.js`
Write Set:
- `package.json`
- `src/lib/db/driver.js`
- `src/lib/db/paths.js`
- `src/lib/db/version.js`
- `src/lib/db/adapters/`
- `src/lib/db/migrations/`
- `src/lib/db/schema.js`
- `src/lib/db/migrate.js`
- `src/lib/db/backup.js`
Actual Files:
- {pending}
DoD:
- [ ] All SQLite legacy files removed from repository.
- [ ] `driver.js` redirects cleanly to `connection.js` or is replaced.
- [ ] `package.json` cleaned of unneeded SQLite dependencies.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 5.2: Test Suite Update and Full Regression Suite Validation
Status: pending
Owner/Subagent: worker-p5
Parallel Group: sequential
Planned Files:
- `tests/unit/db-sqlite-vs-lowdb.test.js`
- `tests/unit/db-driver-chain.test.js`
- `tests/unit/db-migration-chain.test.js`
- `tests/unit/db-concurrent.test.js`
- `tests/unit/db-mongo-e2e.test.js`
Write Set:
- `tests/unit/db-sqlite-vs-lowdb.test.js`
- `tests/unit/db-driver-chain.test.js`
- `tests/unit/db-migration-chain.test.js`
- `tests/unit/db-concurrent.test.js`
- `tests/unit/db-mongo-e2e.test.js`
Actual Files:
- {pending}
DoD:
- [ ] SQLite-specific driver chain tests replaced by MongoDB connection & concurrency tests.
- [ ] Full Vitest suite passes without failures.
- [ ] Application builds successfully via `next build`.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Parallelism

- Batch 1 (Models): Tasks 1.2 and 1.3 can execute concurrently once Task 1.1 (dependencies/connection) is established.
- Batch 2 (Core Repositories) & Batch 3 (Throughput Repositories): Phase 2 (Tasks 2.1, 2.2) and Phase 3 (Tasks 3.1, 3.2, 3.3) have disjoint file write sets and can execute in parallel batches once Phase 1 models are compiled.
- Must stay sequential:
  - Phase 0 -> Phase 1 (Core setup must exist before repository rewrite).
  - Phase 1 -> [Phase 2, Phase 3] (Models and connection layer are prerequisites for repositories).
  - [Phase 2, Phase 3] -> Phase 4 (Public export/import barrel requires all repositories to be migrated).
  - Phase 4 -> Phase 5 (SQLite teardown and full regression occur after MongoDB layer is complete).
- Synchronization points:
  - Sync Point 1: Completion of Phase 1 (connection + models) before releasing Phase 2 and Phase 3.
  - Sync Point 2: Completion of Phase 2 and Phase 3 before executing Phase 4 export/import and migration script.
  - Sync Point 3: Completion of Phase 4 before executing Phase 5 teardown and final regression gate.

## Validation Harness

Pointer to `./validation.md` (single source of truth for the validation harness and required evidence, authored by the `batista-validation` delegate): baseline, task-scoped tests, integration/API/consumer, browser/UI, phase-final validation, practical evidence, Graphify and the regression loop are defined there, not in this plan. This plan keeps DAG, write sets, DoD and the Impact Map.

## Loop Ledger

- 2026-08-22 11:35 | Command: initial plan drafting | Result: pass | Next action: persist plan and await guardian review

## Guardian Review

Status: pending
Questions:
- {none}
Critiques:
- {none}
Required Changes:
- {none}

## Resume Point

- Last completed task: none (planning drafted)
- Next task: Phase 0: Preflight
- Current blockers: none
