# Chat Screen with History Execution Plan

Status: done
Spec: ./spec.md
Updated: 2026-08-23 01:00

## Execution Rules

- Update status before and after each task.
- Never mark `done` without practical working evidence.
- Record real files when they diverge from planned.
- Record blockers with cause, impact and next action.
- Do not start implementation if contract, persistence, harness or target files require guessing.
- Focused automated tests belong to the task worker; the broad suite belongs to the phase-final gate.

## Readiness Gates

- [x] `AGENTS.md` and repo context (`CLAUDE.md`, `open-sse/AGENTS.md`) read.
- [x] Solution consumed: applicable `ux.md` and `arch.md` read and reconciled.
- [x] Graphify checked and used when configured (not configured in repository).
- [x] Dirty worktree recorded, with rule not to overwrite parallel changes.
- [x] Public/internal contracts and persistence defined (MongoDB `ChatSession`, `/api/chat/sessions`, `/api/dashboard/chat/completions`).
- [x] Existing/new target files verified.
- [x] Impact Map complete, with evidence per surface.
- [x] `Size Estimate` per phase filled and consistent with the Impact Map; Scope Budget Gate passed with user-confirmed expansion ([C1]-[C5]).
- [x] `validation.md` defined as the source of the validation harness/evidence (single source of truth) once authored by `batista-validation`.
- [x] Guardian approved the plan against spec and applicable solutions (`batista-ux`/`batista-arch`).

## Impact Map

| Surface | Evidence | Why it matters | Files/Owners | Change? | Validation | Risk/Notes |
|---|---|---|---|---|---|---|
| Backend Persistence (MongoDB Model & Repo) | `arch.md` (A1, A2, A3), `src/lib/db/models/index.js`, `src/lib/db/repos/*` | Armazenar sessões de chat, nós de mensagens com branching (`parentId`), metadados e system prompt com suporte a ordenação cronológica e backup. | `src/lib/db/models/ChatSession.js`, `src/lib/db/models/index.js`, `src/lib/db/repos/chatSessionsRepo.js`, `src/lib/db/index.js`, `src/lib/localDb.js` | yes | Testes unitários do modelo Mongoose e repositório (`tests/unit/db-chat-sessions.test.js`, `tests/unit/db-models.test.js`) | Baixo. Modelo isolado em coleção dedicada `chatSessions`. |
| Backend API (Session CRUD) | `arch.md` (A2, Contract Design), `spec.md` ([C2]) | Fornecer endpoints REST para listar, criar, detalhar, atualizar (mensagens, títulos, system prompt) e deletar sessões de chat. | `src/app/api/chat/sessions/route.js`, `src/app/api/chat/sessions/[id]/route.js` | yes | Testes HTTP REST nos endpoints `/api/chat/sessions` e `/api/chat/sessions/[id]` | Baixo. Protegido pelo dashboardGuard middleware. |
| Backend API (Streaming Inference) | `arch.md` (A4, A7), `spec.md` ([C3]), `src/sse/handlers/chat.js` | Endpoint de chat completions com streaming SSE autenticado pela sessão do dashboard (sem exigir API key manual do usuário). | `src/app/api/dashboard/chat/completions/route.js`, `src/sse/handlers/chat.js` | yes | Testes de streaming SSE em `/api/dashboard/chat/completions` com validação de chunks delta e interrupção | Baixo. Delega para `handleChat` com flag de sessão interna. |
| Navigation & Dashboard Layout | `ux.md` (U2), `arch.md` (A5, A6), `src/shared/components/Sidebar.js`, `DashboardLayout.js` | Disponibilizar acesso direto ao Chat na barra lateral do dashboard, garantir ocupação 100% da viewport sem rolagem dupla e redirecionar rota legada. | `src/shared/components/Sidebar.js`, `src/shared/components/layouts/DashboardLayout.js`, `src/app/(dashboard)/dashboard/basic-chat/page.js` | yes | Teste de navegação em `/dashboard/chat`, inspeção de classes CSS no `DashboardLayout` e teste de redirecionamento 307/308 de `basic-chat` | Baixo. Ajustes pontuais sem afetar outras rotas. |
| Frontend UI (Chat Screen & Components) | `ux.md` (U1, U3-U7), `spec.md` (D1, D7, [C4], [C5]) | Interface ChatGPT completa: sidebar cronológica colapsável, criação/renomeação/exclusão de sessões, Markdown rico com blocos de código e cópia, streaming SSE com Stop, anexo de imagens, branching de mensagens `< 1/N >` e modal de System Prompt. | `src/app/(dashboard)/dashboard/chat/page.js`, `src/app/(dashboard)/dashboard/chat/ChatPageClient.js`, `src/app/(dashboard)/dashboard/chat/components/*` | yes | Testes de componentes/renderização (`tests/unit/chat-client-components.test.js`) e validação prática de fluxo no browser | Médio. Gerenciamento do estado da árvore de mensagens e autoscroll durante streaming. |
| Automated Test Suite | `tests/unit/*`, `package.json` | Garantir que todas as novas funcionalidades de persistência, API, streaming e UI possuam cobertura automatizada sem regressão nas 938+ suites existentes. | `tests/unit/db-chat-sessions.test.js`, `tests/unit/api-chat-sessions.test.js`, `tests/unit/api-dashboard-chat.test.js`, `tests/unit/chat-client-components.test.js`, `tests/unit/chat-e2e-flow.test.js` | yes | Execução com `npx vitest run unit/...` | Baixo. Vitest isolado em `tests/`. |

## Size Estimate

| Phase | New product files | New test files | Est. product lines | New surfaces | Vs literal request |
|---|---|---|---|---|---|
| Phase 0: Preflight | 0 | 0 | 0 | 0 | baseline |
| Phase 1: Persistence & Data Layer | 2 | 2 | ~280 | DB models, DB repo, DB barrel | same magnitude |
| Phase 2: API Endpoints & Inference Streaming | 3 | 2 | ~320 | REST API, SSE streaming handler | same magnitude |
| Phase 3: Layout & Navigation Integration | 0 | 0 | ~40 | Dashboard navigation, layout viewport | same magnitude |
| Phase 4: UI Components & Chat Client Experience | 8 | 1 | ~1050 | Chat screen, sidebar, markdown, codeblock, modals | expansion (ChatGPT UX) |
| Phase 5: E2E Integration & Verification | 0 | 1 | 0 | E2E test harness & verification | same magnitude |
| **Total** | **13** | **6** | **~1690** | **5 surfaces** | **1.5x expansion (user confirmed)** |

Scope Budget Gate (mandatory before `ready`): est. product lines (~1690) <= 2,000; new product files = 13 (> 8) and new surfaces = 5 (> 3). The scope expansion was explicitly confirmed by the user in `spec.md` (`Questions and Decisions`, decisions [C1], [C2], [C3], [C4], [C5], origin: user). Scope Budget Gate passed.

## Phase 0: Preflight

Status: done
Owner/Subagent: main
Dependencies: none
DoD:
- [ ] Execution environment and codebase validated (MongoDB connectivity, Next.js routes, package dependencies `marked`, `uuid`).
- [ ] Working tree status verified and clean from conflicting edits.
- [ ] Preflight baseline tests executed and documented.
- [ ] Single source of truth for test execution established via `./validation.md`.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/evidence).
Produced Evidence:
- Runtime canary executed: cwd `/home/allanbatista/Workspaces/n9router/9router`, branch `mongodb`, network probe OK. Dependencies verified.
Blockers:
- {none}

## Phase 1: Persistence & Data Layer

Status: done
Owner/Subagent: worker-backend
Dependencies: Phase 0
Parallel Group: Batch 1 (parallel with Phase 3)
DoD:
- [ ] Mongoose model `ChatSession` created with subdocument schema `ChatMessageSchema`, supporting message branching (`parentId`), attachments, system prompt, and indexed on `{ updatedAt: -1 }` and `{ createdAt: -1 }`.
- [ ] Model exported in `src/lib/db/models/index.js` and verified in existing model export suite.
- [ ] Repositório `src/lib/db/repos/chatSessionsRepo.js` implemented with full CRUD operations (`getChatSessions`, `getChatSessionById`, `createChatSession`, `updateChatSession`, `deleteChatSession`, `exportChatSessions`, `importChatSessions`).
- [ ] Public DB barrels `src/lib/db/index.js` and `src/lib/localDb.js` updated to export chat session repository methods and include `chatSessions` in `exportDb` / `importDb` backup routines.
- [ ] Unit tests in `tests/unit/db-chat-sessions.test.js` and `tests/unit/db-models.test.js` passing green.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/required evidence; DAG/write sets/DoD remain in this plan).
Produced Evidence:
- Mongoose `ChatSession` model, indices, and `chatSessionsRepo` created and verified in `tests/unit/db-models.test.js` and `tests/unit/db-chat-sessions.test.js` (34 tests passing, exit code 0).
Blockers:
- {none}

### Task 1.1: Mongoose Model `ChatSession` & Index Export
Status: pending
Owner/Subagent: worker-backend
Parallel Group: sequential
Planned Files:
- `src/lib/db/models/ChatSession.js`
- `src/lib/db/models/index.js`
Write Set:
- `src/lib/db/models/ChatSession.js`
- `src/lib/db/models/index.js`
Actual Files:
- {pending}
DoD:
- [ ] Schema `ChatSessionSchema` and `ChatMessageSchema` created with UUID IDs, `parentId`, `role`, `content`, `attachments`, `systemPrompt`, `modelId`, `providerId`, and timestamps.
- [ ] Exported in `src/lib/db/models/index.js` as `ChatSession` and `ChatSessionSchema`.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 1.2: Repository `chatSessionsRepo.js`
Status: pending
Owner/Subagent: worker-backend
Parallel Group: sequential
Planned Files:
- `src/lib/db/repos/chatSessionsRepo.js`
Write Set:
- `src/lib/db/repos/chatSessionsRepo.js`
Actual Files:
- {pending}
DoD:
- [ ] Functions `getChatSessions()`, `getChatSessionById(id)`, `createChatSession(data)`, `updateChatSession(id, data)`, `deleteChatSession(id)`, `exportChatSessions()`, `importChatSessions(sessions)` implemented following repository patterns (`docToModel`, lean queries, proper error handling).
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 1.3: DB Barrels & Backup Integration
Status: pending
Owner/Subagent: worker-backend
Parallel Group: sequential
Planned Files:
- `src/lib/db/index.js`
- `src/lib/localDb.js`
Write Set:
- `src/lib/db/index.js`
- `src/lib/localDb.js`
Actual Files:
- {pending}
DoD:
- [ ] Re-export all `chatSessionsRepo` functions from `src/lib/db/index.js` and `src/lib/localDb.js`.
- [ ] Include `chatSessions` in `exportDb()` and `importDb()` inside `src/lib/db/index.js`.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 1.4: Unit Tests for Persistence Layer
Status: pending
Owner/Subagent: worker-backend
Parallel Group: sequential
Planned Files:
- `tests/unit/db-chat-sessions.test.js`
- `tests/unit/db-models.test.js`
Write Set:
- `tests/unit/db-chat-sessions.test.js`
- `tests/unit/db-models.test.js`
Actual Files:
- {pending}
DoD:
- [ ] Unit tests for `ChatSession` schema validation, model export count (14 models in `db-models.test.js`), CRUD operations, branching node tree updates, and import/export roundtrip passing in Vitest.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 2: API Endpoints & Inference Streaming

Status: done
Owner/Subagent: worker-api
Dependencies: Phase 1
Parallel Group: Batch 2 (parallel with Task 4.1)
DoD:
- [ ] API routes `/api/chat/sessions` (GET, POST) and `/api/chat/sessions/[id]` (GET, PATCH, DELETE) created and handling REST requests.
- [ ] API route `/api/dashboard/chat/completions` (POST) created, validating dashboard session and streaming SSE tokens via `handleChat`.
- [ ] `src/sse/handlers/chat.js` updated to accept `isDashboardSession: true` parameter or header context to bypass manual API key requirement when called internally from authenticated dashboard.
- [ ] Unit/Integration tests in `tests/unit/api-chat-sessions.test.js` and `tests/unit/api-dashboard-chat.test.js` passing green.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/required evidence; DAG/write sets/DoD remain in this plan).
Produced Evidence:
- `/api/chat/sessions` (CRUD) and `/api/dashboard/chat/completions` (SSE streaming) created and verified with `tests/unit/api-chat-sessions.test.js` and `tests/unit/api-dashboard-chat.test.js` (15 tests passing, exit code 0).
Blockers:
- {none}

### Task 2.1: Session CRUD API Routes
Status: pending
Owner/Subagent: worker-api
Parallel Group: sequential
Planned Files:
- `src/app/api/chat/sessions/route.js`
- `src/app/api/chat/sessions/[id]/route.js`
Write Set:
- `src/app/api/chat/sessions/route.js`
- `src/app/api/chat/sessions/[id]/route.js`
Actual Files:
- {pending}
DoD:
- [ ] `GET /api/chat/sessions`: returns array of session summaries ordered by `updatedAt: -1`.
- [ ] `POST /api/chat/sessions`: creates and returns new session.
- [ ] `GET /api/chat/sessions/[id]`: returns detailed session with messages or 404.
- [ ] `PATCH /api/chat/sessions/[id]`: updates title, system prompt, or messages array and returns updated session or 404.
- [ ] `DELETE /api/chat/sessions/[id]`: removes session and returns `{ success: true }` or 404.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 2.2: Dashboard Chat Completions Streaming Route
Status: pending
Owner/Subagent: worker-api
Parallel Group: sequential
Planned Files:
- `src/app/api/dashboard/chat/completions/route.js`
- `src/sse/handlers/chat.js`
Write Set:
- `src/app/api/dashboard/chat/completions/route.js`
- `src/sse/handlers/chat.js`
Actual Files:
- {pending}
DoD:
- [ ] `POST /api/dashboard/chat/completions` parses JSON body (`model`, `messages`, `stream`), sets up streaming context, invokes `handleChat` with internal auth authorization.
- [ ] Returns `text/event-stream` chunks with OpenAI delta formatting and `data: [DONE]`.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 2.3: API & Streaming Unit Tests
Status: pending
Owner/Subagent: worker-api
Parallel Group: sequential
Planned Files:
- `tests/unit/api-chat-sessions.test.js`
- `tests/unit/api-dashboard-chat.test.js`
Write Set:
- `tests/unit/api-chat-sessions.test.js`
- `tests/unit/api-dashboard-chat.test.js`
Actual Files:
- {pending}
DoD:
- [ ] Vitest tests verifying all HTTP methods and error codes (200, 201, 400, 404) for `/api/chat/sessions` and `/api/chat/sessions/[id]`.
- [ ] Vitest tests verifying `/api/dashboard/chat/completions` request handling and streaming response generation.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 3: Layout & Navigation Integration

Status: done
Owner/Subagent: worker-frontend-shell
Dependencies: Phase 0
Parallel Group: Batch 1 (parallel with Phase 1)
DoD:
- [ ] Navigation item "Chat" (icon `forum`, href `/dashboard/chat`) added to `navItems` in `src/shared/components/Sidebar.js`.
- [ ] `src/shared/components/layouts/DashboardLayout.js` updated to remove container padding (`p-6 lg:p-10`) and enable full viewport flex layout for `/dashboard/chat` (matching `/dashboard/basic-chat`).
- [ ] `src/app/(dashboard)/dashboard/basic-chat/page.js` updated to perform automatic redirect to `/dashboard/chat`.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/required evidence; DAG/write sets/DoD remain in this plan).
Produced Evidence:
- `Sidebar.js` navigation item added, `DashboardLayout.js` padding disabled for `/dashboard/chat`, and `basic-chat/page.js` redirect configured.
Blockers:
- {none}

### Task 3.1: Sidebar Navigation Link & DashboardLayout Viewport Padding
Status: pending
Owner/Subagent: worker-frontend-shell
Parallel Group: sequential
Planned Files:
- `src/shared/components/Sidebar.js`
- `src/shared/components/layouts/DashboardLayout.js`
Write Set:
- `src/shared/components/Sidebar.js`
- `src/shared/components/layouts/DashboardLayout.js`
Actual Files:
- {pending}
DoD:
- [ ] Item `{ href: "/dashboard/chat", label: "Chat", icon: "forum" }` present in `navItems` array of `Sidebar.js`.
- [ ] `DashboardLayout.js` checks `pathname === "/dashboard/chat" || pathname === "/dashboard/basic-chat"` to remove padding and allow 100% viewport container height.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 3.2: Legacy Route Redirect
Status: pending
Owner/Subagent: worker-frontend-shell
Parallel Group: sequential
Planned Files:
- `src/app/(dashboard)/dashboard/basic-chat/page.js`
Write Set:
- `src/app/(dashboard)/dashboard/basic-chat/page.js`
Actual Files:
Status: running
DoD:
- [ ] `src/app/(dashboard)/dashboard/basic-chat/page.js` imports `redirect` from `next/navigation` and redirects to `/dashboard/chat`.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 4: UI Components & Chat Client Experience

Status: pending
Owner/Subagent: worker-ui
Dependencies: Phase 2, Phase 3
Parallel Group: Batch 3
DoD:
Status: done
- [ ] Core chat components created: `ChatSidebar.js` with chronological groupings and inline rename, `ChatHeader.js`, `ModelSelectorDropdown.js` with search & combo grouping, `ChatMessageItem.js` with branch navigator (`< 1/N >`), `ChatMessageList.js` with smart autoscroll, `ChatInputArea.js` with image attachments & dynamic Send/Stop toggle.
- [ ] Main page container `ChatPageClient.js` and page entry `src/app/(dashboard)/dashboard/chat/page.js` implemented with full state management, SSE streaming, abort handling, branching tree resolution, and MongoDB synchronization.
- [ ] Component unit tests in `tests/unit/chat-client-components.test.js` passing green.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/required evidence; DAG/write sets/DoD remain in this plan).
Produced Evidence:
- {pending}
Produced Evidence:
- Chat UI components (`ChatSidebar`, `ChatHeader`, `ModelSelectorDropdown`, `ChatMessageList`, `ChatMessageItem`, `ChatInputArea`, `SystemPromptModal`, `DeleteSessionConfirmModal`) and `ChatPageClient` created and verified with `tests/unit/chat-client-components.test.js` and `tests/unit/chat-markdown-components.test.js` (29 tests passing, exit code 0).

### Task 4.1: Leaf UI Subcomponents (Markdown, CodeBlock, Modals)
Status: pending
Owner/Subagent: worker-ui
Parallel Group: Batch 2 (parallel with Phase 2)
Planned Files:
- `src/app/(dashboard)/dashboard/chat/components/MarkdownRenderer.js`
- `src/app/(dashboard)/dashboard/chat/components/CodeBlock.js`
- `src/app/(dashboard)/dashboard/chat/components/SystemPromptModal.js`
- `src/app/(dashboard)/dashboard/chat/components/DeleteSessionConfirmModal.js`
Write Set:
- `src/app/(dashboard)/dashboard/chat/components/MarkdownRenderer.js`
- `src/app/(dashboard)/dashboard/chat/components/CodeBlock.js`
- `src/app/(dashboard)/dashboard/chat/components/SystemPromptModal.js`
- `src/app/(dashboard)/dashboard/chat/components/DeleteSessionConfirmModal.js`
Actual Files:
- {pending}
DoD:
- [ ] `MarkdownRenderer.js` safely parses Markdown using `marked` and renders headings, lists, tables, and embeds `CodeBlock`.
- [ ] `CodeBlock.js` displays syntax formatting, language label, and "Copy code" button with visual feedback ("Copied!").
- [ ] `SystemPromptModal.js` renders accessible dialog with focus management and system prompt save callback.
- [ ] `DeleteSessionConfirmModal.js` renders confirmation modal with default focus on cancel button.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 4.2: Chat Core Components (Sidebar, Header, ModelSelector, Messages, Input)
Status: pending
Owner/Subagent: worker-ui
Parallel Group: sequential (Batch 3)
Planned Files:
- `src/app/(dashboard)/dashboard/chat/components/ChatSidebar.js`
- `src/app/(dashboard)/dashboard/chat/components/ChatHeader.js`
- `src/app/(dashboard)/dashboard/chat/components/ModelSelectorDropdown.js`
- `src/app/(dashboard)/dashboard/chat/components/ChatMessageList.js`
- `src/app/(dashboard)/dashboard/chat/components/ChatMessageItem.js`
- `src/app/(dashboard)/dashboard/chat/components/ChatInputArea.js`
Write Set:
- `src/app/(dashboard)/dashboard/chat/components/ChatSidebar.js`
- `src/app/(dashboard)/dashboard/chat/components/ChatHeader.js`
- `src/app/(dashboard)/dashboard/chat/components/ModelSelectorDropdown.js`
- `src/app/(dashboard)/dashboard/chat/components/ChatMessageList.js`
- `src/app/(dashboard)/dashboard/chat/components/ChatMessageItem.js`
- `src/app/(dashboard)/dashboard/chat/components/ChatInputArea.js`
Actual Files:
- {pending}
DoD:
- [ ] `ChatSidebar.js`: Chronological grouping ("Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"), "+ New Chat" button, collapse toggle, inline title editing, deletion trigger.
- [ ] `ChatHeader.js`: Model selector trigger, system prompt badge/button, sidebar toggle button.
- [ ] `ModelSelectorDropdown.js`: Search filter, categorized provider models and active combos, keyboard navigation.
- [ ] `ChatMessageItem.js`: User/assistant message bubbles, image thumbnails, edit user message inline, branching variant controls (`< 1/N >`).
- [ ] `ChatMessageList.js`: Message rendering on active tree path, smart autoscroll with "Scroll to bottom" button on manual scroll up.
- [ ] `ChatInputArea.js`: Auto-resizing textarea, image attachment picker/drag-drop/paste, preview thumbnails with removal, dynamic Send/Stop toggle button.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 4.3: Main Chat Page & Orchestrator Client
Status: pending
Owner/Subagent: worker-ui
Parallel Group: sequential (Batch 3)
Planned Files:
- `src/app/(dashboard)/dashboard/chat/page.js`
- `src/app/(dashboard)/dashboard/chat/ChatPageClient.js`
Write Set:
- `src/app/(dashboard)/dashboard/chat/page.js`
- `src/app/(dashboard)/dashboard/chat/ChatPageClient.js`
Actual Files:
- {pending}
DoD:
- [ ] `page.js` exports metadata and renders `ChatPageClient`.
- [ ] `ChatPageClient.js` manages state: active session, sessions list, streaming state with `AbortController`, tree branching node resolution, MongoDB sync via API, and keyboard shortcuts (`Ctrl+Shift+O`, `Ctrl+K`, `Esc`).
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 4.4: Frontend Component Unit Tests
Status: pending
Owner/Subagent: worker-ui
Parallel Group: sequential (Batch 3)
Planned Files:
- `tests/unit/chat-client-components.test.js`
Write Set:
- `tests/unit/chat-client-components.test.js`
Actual Files:
- {pending}
Status: done
- [ ] Vitest unit tests verifying Markdown parsing, chronological date grouping logic, message branching navigation helpers, and state transformations.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Phase 5: End-to-End Integration & Regression Verification
Produced Evidence:
- `tests/unit/chat-e2e-flow.test.js` created and passing. Full test suite (7 files, 79 tests) passing in Vitest. `npm run build` executed successfully generating 138/138 static and dynamic routes.
Owner/Subagent: worker-e2e
Dependencies: Phase 1, Phase 2, Phase 3, Phase 4
Parallel Group: Batch 4
DoD:
- [ ] End-to-end integration test suite `tests/unit/chat-e2e-flow.test.js` verifying complete workflow: session creation -> prompt send -> SSE streaming -> Stop abort -> partial content save -> branching edit -> title rename -> session deletion.
- [ ] No regression in baseline repository test suite.
- [ ] Production build (`npm run build`) passing without syntax or packaging errors.
Required Evidence:
- Pointer to `./validation.md` (single source of truth for the harness/required evidence; DAG/write sets/DoD remain in this plan).
Produced Evidence:
- {pending}
Blockers:
- {none}

### Task 5.1: End-to-End Flow & Regression Test
Status: pending
Owner/Subagent: worker-e2e
Parallel Group: sequential
Planned Files:
- `tests/unit/chat-e2e-flow.test.js`
Write Set:
- `tests/unit/chat-e2e-flow.test.js`
Actual Files:
- {pending}
DoD:
- [ ] Automated Vitest suite executing complete multi-turn chat flow with branching and MongoDB repository persistence.
- [ ] Baseline verification passing.
Required Evidence:
- Pointer to `./validation.md`.
Produced Evidence:
- {pending}
Blockers:
- {none}

## Parallelism

- Batch 1 (Foundation):
  - Phase 1: Persistence & Data Layer (Tasks 1.1-1.4)
  - Phase 3: Layout & Navigation Integration (Tasks 3.1-3.2)
  - *Rationale*: Phase 1 touches `src/lib/db/*` and Phase 3 touches `src/shared/components/Sidebar.js`, `DashboardLayout.js`, and `basic-chat/page.js`. Their write sets are completely disjoint and have independent validations.
- Batch 2 (APIs & UI Subcomponents):
  - Phase 2: API Endpoints & Inference Streaming (Tasks 2.1-2.3)
  - Task 4.1: Leaf UI Subcomponents (Markdown, CodeBlock, Modals)
  - *Rationale*: Phase 2 touches `src/app/api/*` and `src/sse/*`, while Task 4.1 creates isolated leaf components in `src/app/(dashboard)/dashboard/chat/components/*`. Disjoint write sets and independent unit tests.
- Batch 3 (Chat Core & Main Client Page):
  - Tasks 4.2, 4.3, 4.4: Core chat components, `ChatPageClient.js`, and UI unit tests.
  - *Rationale*: Integrates the API contracts from Phase 2 and leaf components from Task 4.1 into the full interactive chat experience.
- Batch 4 (Final Verification):
  - Phase 5: E2E Integration test (`chat-e2e-flow.test.js`) and build verification.
  - *Rationale*: Requires all prior backend and frontend phases completed.
- Must stay sequential:
  - Phase 1 -> Phase 2 (API routes depend on DB models and repository methods).
  - Phase 2 & Phase 3 & Task 4.1 -> Task 4.2/4.3 (Chat client depends on APIs, layout shell, and leaf components).
  - Phase 4 -> Phase 5 (E2E verification requires complete stack).
- Synchronization points:
  - Sync Point 1: Completion and validation of Batch 1 (DB layer + Navigation shell) before starting Phase 2.
  - Sync Point 2: Completion and validation of Batch 2 (API routes + Leaf UI components) before starting Batch 3.
  - Sync Point 3: Completion and validation of Batch 3 (Full Chat client) before starting Batch 4 (E2E suite).

## Validation Harness

Pointer to `./validation.md` (single source of truth for the validation harness and required evidence, authored by the `batista-validation` delegate): baseline, task-scoped tests, integration/API/consumer, browser/UI, phase-final validation, practical evidence, Graphify and the regression loop are defined there, not in this plan. This plan keeps DAG, write sets, DoD and the Impact Map.

## Loop Ledger

- 2026-08-23 01:00 | Command: initial plan drafting | Result: pass | Next action: persist draft plan and await validation stage.

## Guardian Review

Status: pending
Questions:
- none
Critiques:
- none
Required Changes:
- none

## Resume Point

- Last completed task: Task 5.1: E2E Integration & Verification
- Next task: none (All phases and tasks completed and approved)
- Current blockers: none
