# Plan: Round Robin With Affinity — plataforma/provider/combo (model-aware, 30m TTL)

Status: spec v2 (3 níveis: plataforma / provider / combo) · key = sha16(toNumeric|raw) · TTL 30m sliding · cap 10k
Last update: 2026-08-22
Spec: docs/spec-round-robin-affinity.md

## Phase 0 — Spec & Scaffolding
| # | Task | Status | Files | Notes |
|---|------|--------|-------|-------|
| 0.1 | Spec v1 provider:model:hash | done | spec-round-robin-affinity.md | sid -504… 4 contas |
| 0.2 | Spec v2 → 3 níveis plataforma/provider/combo | done | spec-round-robin-affinity.md | account=destino, não nível |
| 0.3 | Backup data + compose | done | data_backup_*.tar.gz · compose config | |
| 0.4 | Plan v2 | done | this file | |

## Phase 1 — Persistence (provider + combo)
| # | Task | Status | Files |
|---|------|--------|-------|
| 1.1 | SCHEMA_VERSION 2 → 3 + `sessionAffinity` + `comboAffinity` indexes | done | src/lib/db/schema.js |
| 1.2 | Migrations `002-session-affinity` (fix shape) + `003-combo-affinity` | pending | migrations/002, 003 |
| 1.3 | `sessionAffinityRepo` (hash/normalize/consistentIndex/get/set/touch/prune TTL 30m cap10k 5m interval) | done | repos/sessionAffinityRepo.js |
| 1.4 | `comboAffinityRepo` (get/set/touch/prune por comboName:hash) | pending | repos/comboAffinityRepo.js |
| 1.5 | Export ambos de `src/lib/db/index.js` | pending | db/index.js |
| 1.6 | Manual SQL apply + `SELECT _meta` verify | pending | data/db/data.sqlite |

## Phase 2 — Core (provider + combo)
| # | Task | Status | Files |
|---|------|--------|-------|
| 2.1 | Helpers normalize/consistentIndex em sessionAffinityRepo | done | repos/sessionAffinityRepo.js |
| 2.2 | `getProviderCredentials(...,{cacheKeyHash, rawKey})` branch `round-robin-affinity` — hit/touch/miss consistentHash, respect exclude/modelLock, preferred wins, no-key → LRU | done | src/sse/services/auth.js |
| 2.3 | `open-sse/services/combo.js` — branch `round-robin-affinity` em `getRotatedModels`/`handleComboChat` (provider:model vs combo:hash, repin on locked, stay on new) | pending | open-sse/services/combo.js |
| 2.4 | kiro ephemeral → no affinity (fallback LRU) em ambos | pending | auth.js + combo.js |

## Phase 3 — Chat integration (model-aware)
| # | Task | Status | Files |
|---|------|--------|-------|
| 3.1 | `deriveAffinityParams(provider,model,body,request,clientRawRequest)` antes do while — resolveSessionIdentity → normalize→sha16 | done | src/sse/handlers/chat.js |
| 3.2 | Single: `getProviderCredentials(...,{hash,raw})` por modelo concreto | done | same |
| 3.3 | Combo: derive comboHash (scope=comboName) e passa a `getRotatedModels`/`handleComboChat` | pending | same + combo.js |
| 3.4 | `requestDetail OPTIONAL_PARAMS += prompt_cache_key,session_id,conversation_id` | done | chatCore/requestDetail.js |
| 3.5 | `GET /api/usage/request-details extractIds→cacheKey/sessionId/conversationId` sem vazar | done | api/usage/request-details/route.js |

## Phase 4 — UI (3 níveis)
| # | Task | Status | Files |
|---|------|--------|-------|
| 4.1 | Plataforma `profile/page.js` — Toggle Affinity (platform `fallbackStrategy=round-robin-affinity`) | done | profile/page.js |
| 4.2 | Provider `providers/[id]/page.js` + `ConnectionsCard.js` — select Fill First / Round Robin / Affinity | done | providers |
| 4.3 | Combo `combos/page.js` — STRATEGY_OPTIONS += `round-robin-affinity` + Select 4 opts, saved `comboStrategies[combo].fallbackStrategy` | pending | combos/page.js |
| 4.4 | Keep `fill-first`/`round-robin` untouched | done | — |

## Phase 5 — Observability
| # | Task | Status | Files |
|---|------|--------|-------|
| 5.1 | Logs `AUTH affinity hit/miss provider/model 8hex→conn8` + `COMBO affinity hit/miss combo 8hex→model` | partial | auth.js done, combo.js pending |
| 5.2 | details tokens `input-cached=diff/output` + `ck/sid/cid` small | done | RequestDetailsTab.js |
| 5.3 | RecentRequests provider↑ model account↓ | done | UsageStats.js |

## Phase 6 — Validation
| # | Task | Status | Command |
|---|------|--------|---------|
| 6.1 | `docker compose config` | done | |
| 6.2 | `docker compose build` Next 16 webpack | done | aa1617d→ pending rebuild |
| 6.3 | `GET /api/health 200` + `/api/usage/request-details 200 details cacheKey` | done | curl + sqlite sessionAffinity 0 |
| 6.4 | Manual: 2× same `prompt_cache_key` → same `connectionId` (provider affinity) | pending | curl same key |
| 6.5 | Manual: same session different `model` → different `sessionAffinity` rows | pending | sql |
| 6.6 | Manual: same combo session → same model in combo (combo affinity) | pending | after 4.3 |
| 6.7 | `npm test` no regress | pending | tests |
| 6.8 | `docker compose up -d --build` instruction | pending | ops |

## Acceptance
- Plataforma global `affinity` herdada por providers/combos sem override.
- `provider:model:hash → connectionId` 30m até lock → repin sticky novo.
- `combo:hash → model` 30m até lock → repin sticky novo.
- Fill-first/round-robin intactos.
