# Indexação Configurável de _agent_metadata no MongoDB com Filtros e Métricas Execution Plan

Status: done
Spec: ./spec.md
Updated: 2026-08-22 16:04

## Execution Rules

- Update status before and after each task.
- Never mark `done` without practical working evidence.
- Record real files when they diverge from planned.
- Record blockers with cause, impact and next action.
- Do not start implementation if contract, persistence, harness or target files require guessing.
- Focused automated tests belong to the task worker; the broad suite belongs to the phase-final gate.

## Readiness Gates

- [x] `AGENTS.md` read (checked root and package conventions).
- [x] Solution consumed: applicable `ux.md` and `arch.md` read and reconciled.
- [x] Graphify checked and used when configured (checked project structure and test baselines).
- [x] Dirty worktree recorded, with rule not to overwrite parallel changes.
- [x] Public/internal contracts and persistence defined or marked `none`.
- [x] Existing/new target files verified.
- [x] Impact Map complete, with evidence per surface.
- [x] `Size Estimate` per phase filled and consistent with the Impact Map; the Scope Budget Gate passed or the plan is `blocked` with `Escalation: manifest`.
- [x] `validation.md` defined as the source of the validation harness/evidence (single source of truth) once authored by `batista-validation`.
- [x] Guardian approved the plan against spec and applicable solutions (`batista-ux`/`batista-arch`).

## Impact Map

| Surface | Evidence | Why it matters | Files/Owners | Change? | Validation | Risk/Notes |
|---|---|---|---|---|---|---|
| Backend Settings & Schemas | `src/lib/db/repos/settingsRepo.js:7-64`, `src/lib/db/models/Setting.js:5-15` | Define e persiste a lista de chaves de metadados ativas `agentMetadataKeys` com default `["os", "hostname", "agent-name"]`. | `src/lib/db/models/Setting.js`, `src/lib/db/repos/settingsRepo.js`, `src/app/api/settings/route.js` | yes | `npm test -- tests/unit/db-settings.test.js` | Baixo. Manter compatibilidade com settings legadas via fallback para default. |
| Ingestion & Normalization Pipeline | `open-sse/handlers/chatCore/requestDetail.js:17-80`, `open-sse/handlers/chatCore.js:360-435` | Extrai e normaliza `_agent_metadata` da requisição para um dicionário plano saneado contra operadores MongoDB (`$`, `.`). | `open-sse/utils/agentMetadata.js`, `open-sse/handlers/chatCore/requestDetail.js`, `open-sse/handlers/chatCore.js` | yes | `npm test -- tests/unit/agent-metadata.test.js` | Baixo. Suportar formatos de array `[{key, value}]` e objeto plano. |
| Request Details Persistence & Indexing | `src/lib/db/models/RequestDetail.js:5-27`, `src/lib/db/repos/requestDetailsRepo.js:144-270` | Persiste `agentMetadata` na raiz do documento com índices compostos default e wildcard index, além de filtros dinâmicos de busca. | `src/lib/db/models/RequestDetail.js`, `src/lib/db/repos/requestDetailsRepo.js` | yes | `npm test -- tests/unit/db-request-details.test.js` | Médio. Garantir que índices wildcard e compostos sejam criados sem impacto de lock. |
| Usage & Metrics Aggregation | `src/lib/db/models/UsageDaily.js:5-24`, `src/lib/db/models/UsageHistory.js:5-26`, `src/lib/db/repos/usageRepo.js:212-349` | Incrementa contadores atômicos em `byAgentMetadata` no `UsageDaily` e consolida métricas por dimensões de agentes em `getUsageStats`. | `src/lib/db/models/UsageDaily.js`, `src/lib/db/models/UsageHistory.js`, `src/lib/db/repos/usageRepo.js`, `src/app/api/usage/stats/route.js` | yes | `npm test -- tests/unit/db-usage.test.js` | Médio. Sanear caracteres de pontos (`.`) nos valores de sub-paths do operador `$inc`. |
| Request Details & Distinct APIs | `src/app/api/usage/request-details/route.js:24-116`, novo endpoint de distinct values | Expõe `agentMetadata` sem redação indevida, aceita filtros de metadados e retorna lista de valores distintos para autopreenchimento. | `src/app/api/usage/request-details/route.js`, `src/app/api/usage/metadata-values/route.js` | yes | `npm test -- tests/unit/api-request-details.test.js`, `tests/unit/api-metadata-values.test.js` | Baixo. Redação protege conversas mas mantém `agentMetadata` acessível. |
| Settings / Profile UI | `src/app/(dashboard)/dashboard/profile/page.js:1616-1637` | Interface para visualizar, adicionar, remover tags de `agentMetadataKeys` e restaurar defaults no card de Observability. | `src/app/(dashboard)/dashboard/profile/page.js` | yes | Verificação de renderização de tags, adição, remoção e reset para defaults. | Baixo. Feedback inline com tratamento de erro e validação sintática. |
| Requests Tab UI | `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js:217-482` | Barra de filtros com controles dinâmicos para chaves ativas, badges de metadados na listagem e bloco dedicado no Drawer. | `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js` | yes | Verificação de filtros por agente/SO/hostname, badges na tabela e cópia no Drawer. | Baixo. Reset de filtros limpa todos os metadados. |
| Usage Stats Dashboard UI | `src/shared/components/UsageStats.js:195-200, 327-440` | Seletor de visualização expandido com opções de métricas por dimensões de agentes e tabela com ordenação. | `src/shared/components/UsageStats.js` | yes | Seleção de dimensões de agentes e verificação de totais de tokens/custo/requisições. | Baixo. Fallback para empty state caso não haja uso registrado no período. |

## Size Estimate

| Phase | New product files | New test files | Est. product lines | New surfaces | Vs literal request |
|---|---|---|---|---|---|
| Phase 0: Preflight | 0 | 0 | 0 | 0 | same magnitude |
| Phase 1: Ingestion & Settings Configuration | 1 | 2 | ~110 | 0 | same magnitude |
| Phase 2: Storage, Indexing & Usage Aggregates | 0 | 2 | ~140 | 0 | same magnitude |
| Phase 3: APIs for Requests & Metadata Values | 1 | 2 | ~90 | 0 | same magnitude |
| Phase 4: Frontend UI (Profile, Requests & Stats) | 0 | 0 | ~160 | 0 | same magnitude |
| Phase 5: E2E & Final Validation Gate | 0 | 0 | 0 | 0 | same magnitude |
| **Total** | **2** | **6** | **~500** | **0** | **same magnitude** |

Scope Budget Gate: est. product lines (~500) <= 2,000, new surfaces (0) <= 3, new product files (2) <= 8. Scope Budget Gate passed without requiring user-confirmed expansion.

## Phase 0: Preflight

Status: pending
Owner/Subagent: main
Dependencies: none
DoD:
- [ ] Execution can start without guessing decisions.
- [ ] Verify test runner baseline and database mock/connection fixtures.
- [ ] Confirm existing schemas, repo methods and API routes.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/evidence).
Produced Evidence:
- {pending}
Blockers:
- {none}
Status: done
Owner/Subagent: main
Dependencies: none
DoD:
- [x] Runtime canary executado e validado (pwd, branch mongodb, git toplevel, conectividade online).
- [x] Conexão com MongoDB ativa e validada.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- CanaryWorker-2 confirmou pwd=`/home/allanbatista/Workspaces/n9router/9router`, branch=`mongodb`, conectividade ativa com Cloudflare.
Blockers:
- none

## Phase 1: Settings Config, Schemas & Ingestion Normalization

Status: running
Blockers:
- {none}

### Task 1.1: Settings Repo, Model & API for Metadata Keys

Status: pending
Owner/Subagent: worker
Parallel Group: batch-1
Planned Files:
- `src/lib/db/models/Setting.js`
- `src/lib/db/repos/settingsRepo.js`
- `src/app/api/settings/route.js`
- `tests/unit/db-settings.test.js`
Write Set:
- `src/lib/db/models/Setting.js`
- `src/lib/db/repos/settingsRepo.js`
- `src/app/api/settings/route.js`
- `tests/unit/db-settings.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `agentMetadataKeys: ["os", "hostname", "agent-name"]` present in `DEFAULT_SETTINGS`.
- [ ] `SettingSchema` supports `agentMetadataKeys` array of strings.
- [ ] `PATCH /api/settings` validates key names (`/^[a-zA-Z0-9_-]+$/`) and persists changes to the `global` setting document.
- [ ] Unit tests pass for settings default values and update lifecycle.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 1.2: Agent Metadata Ingestion Helper & Chat Core Pipeline

Status: pending
Owner/Subagent: worker
Parallel Group: batch-1
Planned Files:
- `open-sse/utils/agentMetadata.js`
- `open-sse/handlers/chatCore/requestDetail.js`
- `open-sse/handlers/chatCore.js`
- `tests/unit/agent-metadata.test.js`
Write Set:
- `open-sse/utils/agentMetadata.js`
- `open-sse/handlers/chatCore/requestDetail.js`
- `open-sse/handlers/chatCore.js`
- `tests/unit/agent-metadata.test.js`
Actual Files:
- {pending}
DoD:
- [ ] Helper `normalizeAgentMetadata` created supporting array `[{ key, value }]` and flat object `{ key: value }`.
- [ ] Key sanitization rejects/strips `$` prefixes and `.` separators; scalar values truncated safely (max 256 chars).
- [ ] `extractRequestConfig` and `buildRequestDetail` extract and attach normalized `agentMetadata`.
- [ ] Unit tests pass covering standard, malformed and adversarial `_agent_metadata` payloads.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 2: Database Storage, Indexing & Usage Aggregates

Status: pending
Owner/Subagent: worker
Dependencies: Phase 1
Parallel Group: sequential
DoD:
- [ ] `RequestDetail` schema and repo store `agentMetadata` with compound indexes (`agent-name`, `os`, `hostname`) and wildcard index.
- [ ] `requestDetailsRepo.getRequestDetails` supports dynamic filtering by `agentMetadata.<key>` and `agentMetadata[<key>]`.
- [ ] `UsageDaily` and `UsageHistory` schemas support `byAgentMetadata` and `agentMetadata`.
- [ ] `usageRepo.saveRequestUsage` performs atomic `$inc` updates on `byAgentMetadata.<dim>.<escapedVal>` with dot-safe encoding.
- [ ] `usageRepo.getUsageStats` consolidates `byAgentMetadata` for all requested time periods.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 2.1: RequestDetail Model & Repo with Dynamic Filters & Indexing

Status: pending
Owner/Subagent: worker
Parallel Group: batch-2
Planned Files:
- `src/lib/db/models/RequestDetail.js`
- `src/lib/db/repos/requestDetailsRepo.js`
- `tests/unit/db-request-details.test.js`
Write Set:
- `src/lib/db/models/RequestDetail.js`
- `src/lib/db/repos/requestDetailsRepo.js`
- `tests/unit/db-request-details.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `RequestDetailSchema` defines `agentMetadata` and indexes `{ "agentMetadata.agent-name": 1, timestamp: -1 }`, `{ "agentMetadata.os": 1, timestamp: -1 }`, `{ "agentMetadata.hostname": 1, timestamp: -1 }`, and `{ "agentMetadata.$**": 1 }`.
- [ ] `flushToDatabase` persists `agentMetadata` on the root document level in bulk operations.
- [ ] `docToDetail` transforms `agentMetadata` ensuring a clean object fallback (`{}`).
- [ ] `getRequestDetails` translates metadata filters into dot-notation query parameters with pagination.
- [ ] Unit tests pass for batch persistence, index definitions and filtered query retrieval.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 2.2: Usage Daily Aggregation, History Storage & Stats Consolidation

Status: pending
Owner/Subagent: worker
Parallel Group: batch-2
Planned Files:
- `src/lib/db/models/UsageDaily.js`
- `src/lib/db/models/UsageHistory.js`
- `src/lib/db/repos/usageRepo.js`
- `tests/unit/db-usage.test.js`
Write Set:
- `src/lib/db/models/UsageDaily.js`
- `src/lib/db/models/UsageHistory.js`
- `src/lib/db/repos/usageRepo.js`
- `tests/unit/db-usage.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `UsageDailySchema` includes `byAgentMetadata: { type: Schema.Types.Mixed, default: () => ({}) }`.
- [ ] `UsageHistorySchema` includes `agentMetadata: { type: Schema.Types.Mixed, default: () => ({}) }`.
- [ ] `saveRequestUsage` iterates through `agentMetadata` entries and applies `$inc` on `byAgentMetadata.<dim>.<escapedVal>` with `rawValue` and `lastUsed` tracking.
- [ ] Sub-path keys sanitize dots (`.` -> `_dot_` or safe encoding) to prevent unintended nested field explosion.
- [ ] `getUsageStats` consolidates `byAgentMetadata` metrics across daily summaries and recent history.
- [ ] Unit tests pass for atomic aggregation and stats rollup.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 3: APIs for Requests & Metadata Values

Status: pending
Owner/Subagent: worker
Dependencies: Phase 2
Parallel Group: sequential
DoD:
- [ ] `GET /api/usage/request-details` accepts metadata filter parameters and returns redacted records with intact `agentMetadata`.
- [ ] `GET /api/usage/metadata-values` returns distinct values for a given metadata key.
- [ ] `GET /api/usage/stats` returns `byAgentMetadata` grouped by active dimensions.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 3.1: Request Details API with Query Filters & Unredacted Metadata

Status: pending
Owner/Subagent: worker
Parallel Group: batch-3
Planned Files:
- `src/app/api/usage/request-details/route.js`
- `tests/unit/api-request-details.test.js`
Write Set:
- `src/app/api/usage/request-details/route.js`
- `tests/unit/api-request-details.test.js`
Actual Files:
- {pending}
DoD:
- [ ] `GET /api/usage/request-details` extracts `agentMetadata.<key>` and `agentMetadata[<key>]` query parameters.
- [ ] Redaction preserves `agentMetadata` object in each returned detail item while masking full conversation messages.
- [ ] Unit tests verify metadata query parameter parsing, filtering and redaction behavior.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 3.2: Distinct Metadata Values API Route

Status: pending
Owner/Subagent: worker
Parallel Group: batch-3
Planned Files:
- `src/app/api/usage/metadata-values/route.js`
- `tests/unit/api-metadata-values.test.js`
Write Set:
- `src/app/api/usage/metadata-values/route.js`
- `tests/unit/api-metadata-values.test.js`
Actual Files:
- {pending}
DoD:
- [ ] Route `GET /api/usage/metadata-values` created requiring `key` query parameter.
- [ ] Uses `RequestDetail.distinct("agentMetadata.<key>")` returning sorted string array `{ key, values }`.
- [ ] Returns HTTP 400 when `key` query parameter is missing or invalid.
- [ ] Unit tests verify successful distinct value resolution and validation error responses.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 4: Frontend UI (Profile, Requests & Stats)

Status: pending
Owner/Subagent: worker
Dependencies: Phase 3
Parallel Group: sequential
DoD:
- [ ] Settings / Profile page allows adding, removing, and resetting `agentMetadataKeys` with inline feedback.
- [ ] Requests Tab renders dynamic filter inputs for active metadata keys, table badges, and dedicated Drawer section.
- [ ] Usage Stats tab supports viewing aggregated tables by metadata dimensions (`agent-name`, `os`, `hostname`).
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 4.1: Profile / Settings Metadata Keys Management UI

Status: pending
Owner/Subagent: worker
Parallel Group: batch-4
Planned Files:
- `src/app/(dashboard)/dashboard/profile/page.js`
Write Set:
- `src/app/(dashboard)/dashboard/profile/page.js`
Actual Files:
- {pending}
DoD:
- [ ] "Indexed Metadata Keys" section added to Observability card in `/dashboard/profile`.
- [ ] Tag chips rendered with remove (`✕`) action and accessible `aria-label`.
- [ ] Input field with `+ Add` button and `Enter` key support, validating non-empty, unique, alphanumeric/kebab-case strings.
- [ ] "Reset to defaults" button to restore `["os", "hostname", "agent-name"]`.
- [ ] Inline success/error feedback during asynchronous `PATCH /api/settings`.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 4.2: Requests Tab Dynamic Filters, Badges & Drawer Section

Status: pending
Owner/Subagent: worker
Parallel Group: batch-4
Planned Files:
- `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`
Write Set:
- `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`
Actual Files:
- {pending}
DoD:
- [ ] Fetches active `agentMetadataKeys` from settings and renders responsive filter inputs for active keys.
- [ ] Table rows render compact `Badge` chips for `os`, `agent-name`, and `hostname`.
- [ ] Drawer includes dedicated "Agent Metadata" section with structured key-value display and JSON copy button with feedback.
- [ ] "Clear Filters" resets all metadata filters alongside provider and date filters, resetting page to 1.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 4.3: UsageStats Grouping & Aggregates by Agent Dimensions

Status: pending
Owner/Subagent: worker
Parallel Group: batch-4
Planned Files:
- `src/shared/components/UsageStats.js`
Write Set:
- `src/shared/components/UsageStats.js`
Actual Files:
- {pending}
DoD:
- [ ] `TABLE_OPTIONS` extended with active agent metadata dimensions (e.g. "Usage by Agent", "Usage by OS", "Usage by Hostname").
- [ ] Renders aggregated metrics (requests, prompt tokens, cached tokens, completion tokens, cost, last used) per metadata value.
- [ ] Column sorting and responsive styling match existing model/account tables.
- [ ] Empty state renders friendly message when no metadata usage is recorded in the period.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 5: E2E & Final Validation Gate

Status: pending
Owner/Subagent: worker
Dependencies: Phase 4
Parallel Group: sequential
DoD:
- [ ] Full end-to-end integration verified: setting update -> request ingestion with `_agent_metadata` -> MongoDB indexing -> filtered query in API/UI -> atomic usage aggregation in `UsageDaily` -> dashboard visualization.
- [ ] All new and existing test suites pass without regression.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/required evidence).
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 5.1: End-to-End Validation & Regression Gate

Status: pending
Owner/Subagent: worker
Parallel Group: sequential
Planned Files:
- none (read-only execution of test suites and validation scripts)
Write Set:
- none
Actual Files:
- {pending}
DoD:
- [ ] All unit and API test suites pass (`npm test`).
- [ ] Verification script checks ingestion with `_agent_metadata`, retrieval via filtered API, and aggregation in `UsageDaily`.
- [ ] Frontend build and linting checks succeed without error.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Parallelism

- Batch 1: Task 1.1 (`src/lib/db/models/Setting.js`, `settingsRepo.js`, `settings/route.js`) and Task 1.2 (`open-sse/utils/agentMetadata.js`, `chatCore/requestDetail.js`, `chatCore.js`).
- Batch 2: Task 2.1 (`RequestDetail.js`, `requestDetailsRepo.js`) and Task 2.2 (`UsageDaily.js`, `UsageHistory.js`, `usageRepo.js`).
- Batch 3: Task 3.1 (`api/usage/request-details/route.js`) and Task 3.2 (`api/usage/metadata-values/route.js`).
- Batch 4: Task 4.1 (`dashboard/profile/page.js`), Task 4.2 (`RequestDetailsTab.js`), and Task 4.3 (`UsageStats.js`).
- Must stay sequential: Phase 0 -> Batch 1 -> Batch 2 -> Batch 3 -> Batch 4 -> Phase 5.
- Synchronization points:
  - Sync Point 1: Wait for Batch 1 (Ingestion & Settings) before starting Batch 2 (DB Models & Storage).
  - Sync Point 2: Wait for Batch 2 (DB Models & Storage) before starting Batch 3 (API Routes).
  - Sync Point 3: Wait for Batch 3 (API Routes) before starting Batch 4 (Frontend UI).
  - Sync Point 4: Wait for Batch 4 (Frontend UI) before starting Phase 5 (Final Gate).

## Validation Harness

Pointer to `./validation.md` (single source of truth for the validation harness and required evidence, authored by the `batista-validation` delegate): baseline, task-scoped tests, integration/API/consumer, browser/UI, phase-final validation, practical evidence, Graphify and the regression loop are defined there, not in this plan. This plan keeps DAG, write sets, DoD and the Impact Map.

## Loop Ledger

- 2026-08-22 15:40 | Command: Initial plan creation from spec.md, ux.md, arch.md | Result: pass | Next action: Submit plan for guardian review.

## Guardian Review

Status: pending
Questions:
- none
Critiques:
- none
Required Changes:
- none

## Resume Point

- Last completed task: none
- Next task: Phase 0 Preflight
- Current blockers: none
