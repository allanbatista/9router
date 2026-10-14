# Chat Screen with History — Plano e Progresso de Validação

Status: done
Spec: ./spec.md
Plan: ./plan.md
Updated: 2026-08-23 02:15

> `Validation Plan` formulado **antes** de qualquer validação; `Validation Progress` item a item.
> Nenhuma validação foi executada até a data/hora acima; todos os itens estão `pending`.

## Validation Plan

Itens `V#` derivados do Impact Map e das tasks do `plan.md`, cobrindo **todas** as alterações da feature. Cada item vincula requisito/acceptance criterion da spec (R#), método/comandos concretos, evidência esperada (saída observável + exit code) e a fase/task que produz a evidência.

### V1 — Modelo Mongoose ChatSession, Índices e Exportações no Barrel DB

- **Descrição:** Valida a definição do schema Mongoose `ChatSessionSchema` e `ChatMessageSchema`, exportações no index de modelos (`src/lib/db/models/index.js`), índices `{ updatedAt: -1 }` e `{ createdAt: -1 }`, e contagem total de modelos exportados (14 modelos).
- **Requisito/AC:** R4, R13 (Given a database connection, When Mongoose models are loaded, Then ChatSession is exported and indices are defined)
- **Método/comandos:**
  - `npx vitest run tests/unit/db-models.test.js --config tests/vitest.config.js`
- **Evidência esperada:** Suíte `Mongoose Models Suite` executando com sucesso, asserção de 14 modelos/schemas exportados (incluindo `ChatSession` e `ChatSessionSchema`), verificação de índices e exit code 0.
- **Fase/task produtora:** Phase 1 (Task 1.1, Task 1.3, Task 1.4)

### V2 — Operações CRUD e Backup do Repositório `chatSessionsRepo`

- **Descrição:** Valida as operações completas de persistência no repositório `chatSessionsRepo.js` (`createChatSession`, `getChatSessions`, `getChatSessionById`, `updateChatSession`, `deleteChatSession`, `exportChatSessions`, `importChatSessions`) e sua integração com os barrels `src/lib/db/index.js` e `src/lib/localDb.js`.
- **Requisito/AC:** R4, R5, R11, R13 (Given a chat session with messages and branches, When CRUD/backup operations are executed, Then documents are correctly persisted and retrieved)
- **Método/comandos:**
  - `npx vitest run tests/unit/db-chat-sessions.test.js --config tests/vitest.config.js`
- **Evidência esperada:** Suíte `db-chat-sessions.test.js` passando 100% dos testes cobrindo criação, listagem ordenada por `updatedAt: -1`, busca por ID, mutação de mensagens com nós de branching (`parentId`), atualização de título, exclusão física e roundtrip de `exportDb`/`importDb`, com exit code 0.
- **Fase/task produtora:** Phase 1 (Task 1.2, Task 1.3, Task 1.4)

### V3 — Endpoints REST de Gestão de Sessões (`/api/chat/sessions`)

- **Descrição:** Valida os handlers de rotas HTTP REST em `src/app/api/chat/sessions/route.js` e `src/app/api/chat/sessions/[id]/route.js` para os métodos GET, POST, PATCH e DELETE, incluindo validações de entrada e tratamento de erro 404/400.
- **Requisito/AC:** R4, R5, R13 (Given HTTP requests to `/api/chat/sessions` and `/api/chat/sessions/[id]`, When operations are performed, Then JSON responses match the contract and persist changes)
- **Método/comandos:**
  - `npx vitest run tests/unit/api-chat-sessions.test.js --config tests/vitest.config.js`
- **Evidência esperada:** Suíte `api-chat-sessions.test.js` passando todos os casos de teste: listagem resumida (`sessions: [...]`), criação (`201 Created`), detalhamento com árvore de mensagens (`200 OK`), atualização parcial (`PATCH`), deleção (`{ success: true }`) e retornos de erro 404/400, com exit code 0.
- **Fase/task produtora:** Phase 2 (Task 2.1, Task 2.3)

### V4 — Endpoint de Inferência de Chat com Streaming SSE para o Dashboard

- **Descrição:** Valida o endpoint `POST /api/dashboard/chat/completions` e a integração com `src/sse/handlers/chat.js` utilizando a autorização interna da sessão do dashboard (sem exigir chave de API manual), emitindo chunks delta SSE e terminando com `data: [DONE]`.
- **Requisito/AC:** R6, R8, R12 (Given a prompt sent from dashboard, When completion is requested, Then SSE stream is returned with delta tokens)
- **Método/comandos:**
  - `npx vitest run tests/unit/api-dashboard-chat.test.js --config tests/vitest.config.js`
- **Evidência esperada:** Suíte `api-dashboard-chat.test.js` validando header `Content-Type: text/event-stream; charset=utf-8`, formatação OpenAI delta (`data: {"choices":[{"delta":{"content":"..."}}]}`), inclusão de `systemPrompt`, repasse para combos/provedores e encerramento com `data: [DONE]`, com exit code 0.
- **Fase/task produtora:** Phase 2 (Task 2.2, Task 2.3)

### V5 — Navegação na Barra Lateral do Dashboard e Enquadramento de Viewport sem Rolagem Dupla

- **Descrição:** Valida a presença do item "Chat" (ícone `forum`, rota `/dashboard/chat`) na lista de navegação `navItems` de `src/shared/components/Sidebar.js` e a regra de remoção de padding e altura de 100% da viewport em `src/shared/components/layouts/DashboardLayout.js`.
- **Requisito/AC:** R1 (Given the dashboard sidebar, When the user views navigation items, Then Chat link is present and layout applies zero container padding)
- **Método/comandos:**
  - `grep -n '"/dashboard/chat"' src/shared/components/Sidebar.js`
  - `grep -n 'forum' src/shared/components/Sidebar.js`
  - `grep -n 'dashboard/chat' src/shared/components/layouts/DashboardLayout.js`
- **Evidência esperada:** Presença confirmada de `{ href: "/dashboard/chat", label: "Chat", icon: "forum" }` em `Sidebar.js` e condição `pathname === "/dashboard/chat"` desativando padding de container em `DashboardLayout.js`, com exit code 0.
- **Fase/task produtora:** Phase 3 (Task 3.1)

### V6 — Redirecionamento Automático da Rota Legada `/dashboard/basic-chat`

- **Descrição:** Valida que a rota legada `/dashboard/basic-chat` executa redirecionamento automático para a nova rota canônica `/dashboard/chat`.
- **Requisito/AC:** R2 (Given the URL `/dashboard/basic-chat`, When accessed, Then the browser redirects automatically to `/dashboard/chat`)
- **Método/comandos:**
  - `grep -n 'redirect("/dashboard/chat")' src/app/\(dashboard\)/dashboard/basic-chat/page.js`
- **Evidência esperada:** Presença de `redirect("/dashboard/chat")` (ou import de `redirect` de `next/navigation`) em `basic-chat/page.js`, com exit code 0.
- **Fase/task produtora:** Phase 3 (Task 3.2)

### V7 — Renderização de Markdown Rico com Blocos de Código e Botão de Cópia

- **Descrição:** Valida o componente `MarkdownRenderer.js` utilizando a biblioteca `marked` para renderização de títulos, listas, tabelas GFM e blocos de código com destaque visual e botão "Copy code" com confirmação de cópia (`CodeBlock.js`).
- **Requisito/AC:** R7 (Given an assistant message containing markdown code fences, When rendered, Then syntax styling and a functioning "Copy code" button are displayed)
- **Método/comandos:**
  - `npx vitest run tests/unit/chat-client-components.test.js -t "MarkdownRenderer|CodeBlock" --config tests/vitest.config.js`
- **Evidência esperada:** Testes unitários validando parsing seguro de Markdown, renderização de tabelas e listas, injeção de `CodeBlock` e comportamento de cópia para a área de transferência com feedback visual temporário ("Copied!"), com exit code 0.
- **Fase/task produtora:** Phase 4 (Task 4.1, Task 4.4)

### V8 — Barra Lateral de Histórico com Agrupamento Cronológico, Renomeação Inline e Exclusão

- **Descrição:** Valida o componente `ChatSidebar.js`, cobrindo agrupamento cronológico de sessões ("Hoje", "Ontem", "Últimos 7 dias", "Últimos 30 dias", "Anteriores"), botão "+ Novo Chat", recolhimento/expansão da barra lateral, renomeação inline de título e modal de exclusão (`DeleteSessionConfirmModal.js`).
- **Requisito/AC:** R3, R5 (Given historical sessions, When displayed in ChatSidebar, Then they are grouped into chronological categories with inline rename and delete controls)
- **Método/comandos:**
  - `npx vitest run tests/unit/chat-client-components.test.js -t "ChatSidebar|chronological grouping" --config tests/vitest.config.js`
- **Evidência esperada:** Testes unitários validando a função de agrupamento de datas, emissão de eventos de seleção de sessão, edição inline de título com atalhos `Enter`/`Esc` e abertura do diálogo de confirmação de exclusão, com exit code 0.
- **Fase/task produtora:** Phase 4 (Task 4.1, Task 4.2, Task 4.4)

### V9 — Seletor de Modelos de Provedores e Combos com Busca Textual

- **Descrição:** Valida o componente `ModelSelectorDropdown.js` no cabeçalho do chat, permitindo filtrar e selecionar tanto modelos diretos de provedores conectados quanto Combos ativos cadastrados no 9Router, com suporte a navegação por teclado (`Ctrl+K`).
- **Requisito/AC:** R9 (Given connected providers and active combos, When opening the model selector, Then options appear grouped by category with search filtering)
- **Método/comandos:**
  - `npx vitest run tests/unit/chat-client-components.test.js -t "ModelSelectorDropdown" --config tests/vitest.config.js`
- **Evidência esperada:** Testes unitários cobrindo agrupamento de itens em seções ("Modelos de Provedores" e "Combos Inteligentes"), filtragem por string de busca, seleção de item e fechamento via `Esc`/backdrop, com exit code 0.
- **Fase/task produtora:** Phase 4 (Task 4.2, Task 4.4)

### V10 — Anexo e Pré-visualização de Imagens para Modelos de Visão Multimodal

- **Descrição:** Valida a área de input `ChatInputArea.js` para captura de imagens via botão de upload, colagem de clipboard (`Ctrl+V`) e drag-and-drop, exibição de miniaturas de preview com botão de remoção rápida, e exibição de miniaturas no balão da mensagem do usuário (`ChatMessageItem.js`).
- **Requisito/AC:** R10 (Given an image attached to the prompt, When submitted, Then the thumbnail renders in the user turn and payload is prepared for multimodal models)
- **Método/comandos:**
  - `npx vitest run tests/unit/chat-client-components.test.js -t "ChatInputArea|attachments" --config tests/vitest.config.js`
- **Evidência esperada:** Testes unitários validando validação de MIME types de imagem (`image/jpeg`, `image/png`, `image/webp`, `image/gif`), geração de `dataUrl`, renderização do carrossel de previews, remoção de anexo individual e integração ao payload de envio, com exit code 0.
- **Fase/task produtora:** Phase 4 (Task 4.2, Task 4.4)

### V11 — Árvore de Mensagens, Edição de Turnos com Branching e Navegação de Variantes (`< 1/N >`)

- **Descrição:** Valida o gerenciamento da árvore de nós de mensagens (`ChatMessageList.js`, `ChatMessageItem.js`, `ChatPageClient.js`), resolução do caminho ativo via `parentId`, criação de novo branch ao salvar edição de um turno anterior de usuário e paginação entre variantes (`< 1/N >`).
- **Requisito/AC:** R11, R13 (Given a conversation with multiple turns, When the user edits an earlier prompt and resubmits, Then a new branch is created with version controls `< 1/N >`)
- **Método/comandos:**
  - `npx vitest run tests/unit/chat-client-components.test.js -t "branching|ChatMessageItem" --config tests/vitest.config.js`
- **Evidência esperada:** Testes unitários validando reconstrução linear da conversa a partir do array com `parentId`, criação de bifurcação na árvore sem sobrescrever nós irmãos, e alternância entre branches atualizando a visão ativa, com exit code 0.
- **Fase/task produtora:** Phase 4 (Task 4.2, Task 4.3, Task 4.4)

### V12 — Interrupção de Streaming (Stop Generating) e Modal de System Prompt

- **Descrição:** Valida o controle de interrupção de inferência em tempo real via `AbortController` (botão "Stop generating" / atalho `Esc`) preservando o conteúdo parcial recebido, e a configuração de instruções customizadas da conversa via `SystemPromptModal.js` com persistência na sessão e badge ativo no cabeçalho.
- **Requisito/AC:** R8, R12 (Given an active stream, When Stop is clicked, Then SSE stream is aborted and partial content is kept; Given custom system prompt configured, Then it persists in session)
- **Método/comandos:**
  - `npx vitest run tests/unit/chat-client-components.test.js -t "SystemPromptModal|Stop generating" --config tests/vitest.config.js`
- **Evidência esperada:** Testes unitários validando transição do botão Enviar -> Parar durante streaming, disparo de abort no `AbortController`, preservação do texto parcial na sessão via `PATCH`, e persistência/exibição do badge de System Prompt customizado, com exit code 0.
- **Fase/task produtora:** Phase 4 (Task 4.1, Task 4.2, Task 4.3, Task 4.4)

### V13 — Fluxo E2E Integrado da Tela de Chat e Verificação de Regressão Geral

- **Descrição:** Valida o fluxo end-to-end completo da aplicação (criar sessão no MongoDB -> enviar prompt -> receber streaming SSE -> interromper com Stop -> editar turno anterior com branching -> renomear sessão -> deletar sessão) e executa o build de produção do Next.js sem erros de compilação ou regressão.
- **Requisito/AC:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13 (Given the full chat ecosystem, When multi-turn workflows are executed, Then end-to-end integration succeeds and production build compiles cleanly)
- **Método/comandos:**
  - `npx vitest run tests/unit/chat-e2e-flow.test.js --config tests/vitest.config.js`
  - `npm run build`
- **Evidência esperada:** Suíte `chat-e2e-flow.test.js` passando com sucesso cobrindo todo o ciclo de vida de conversação e persistência; `npm run build` concluindo com sucesso sem erros de bundling ou linting, com exit code 0.
- **Fase/task produtora:** Phase 5 (Task 5.1)

## Validation Progress

Um registro por item `V#`. O **manager de execução** (`batista-execute`) atualiza `Status`/`Evidência produzida` a partir de relatórios do worker e veredictos do `workflow-validator`; o **`workflow-validator`** confere cada item (status + evidência) com aprovação positiva explícita antes de qualquer `pass`.

| Item | Status | Evidência produzida | Conferido pelo workflow-validator |
|---|---|---|---|
| V1 — Modelo Mongoose ChatSession, Índices e Exportações no Barrel DB | pass | Suíte `db-models.test.js` passou 25 testes cobrindo os 14 modelos e schema `ChatSession` com índices `{ updatedAt: -1 }` e `{ createdAt: -1 }` (exit code 0). | aprovado pelo workflow-validator |
| V2 — Operações CRUD e Backup do Repositório `chatSessionsRepo` | pass | Suíte `db-chat-sessions.test.js` passou 9 testes cobrindo CRUD, branching tree (`parentId`), e `exportDb`/`importDb` roundtrip (exit code 0). | aprovado pelo workflow-validator |
| V3 — Endpoints REST de Gestão de Sessões (`/api/chat/sessions`) | pass | Suíte `api-chat-sessions.test.js` passou 10 testes cobrindo GET/POST/PATCH/DELETE e códigos 200, 201, 404, 400 (exit code 0). | aprovado pelo workflow-validator |
| V4 — Endpoint de Inferência de Chat com Streaming SSE para o Dashboard | pass | Suíte `api-dashboard-chat.test.js` passou 5 testes cobrindo SSE headers, bypass `isDashboardSession: true` e `handleChat` streaming (exit code 0). | aprovado pelo workflow-validator |
| V5 — Navegação na Barra Lateral do Dashboard e Enquadramento de Viewport | pass | `Sidebar.js` contém `{ href: "/dashboard/chat", label: "Chat", icon: "forum" }`; `DashboardLayout.js` remove container padding para `/dashboard/chat` e `/dashboard/basic-chat` (exit code 0). | aprovado pelo workflow-validator |
| V6 — Redirecionamento Automático da Rota Legada `/dashboard/basic-chat` | pass | `src/app/(dashboard)/dashboard/basic-chat/page.js` executa `redirect("/dashboard/chat")` (exit code 0). | aprovado pelo workflow-validator |
| V7 — Renderização de Markdown Rico com Blocos de Código e Botão de Cópia | pass | Suíte `chat-markdown-components.test.js` passou 12 testes cobrindo GFM, tabelas, sanitização de links e `CodeBlock` com botão de cópia (exit code 0). | aprovado pelo workflow-validator |
| V8 — Barra Lateral de Histórico com Agrupamento Cronológico, Renomeação e Exclusão | pass | `ChatSidebar.js` e `DeleteSessionConfirmModal.js` implementam agrupamento temporal de 5 categorias, edição inline e confirmação de exclusão; suíte `chat-client-components.test.js` passou com sucesso (exit code 0). | aprovado pelo workflow-validator |
| V9 — Seletor de Modelos de Provedores e Combos com Busca Textual | pass | `ModelSelectorDropdown.js` implementa categorização por provedores e combos, filtro de busca instantâneo e atalhos; suíte `chat-client-components.test.js` cobriu todos os filtros (exit code 0). | aprovado pelo workflow-validator |
| V10 — Anexo e Pré-visualização de Imagens para Modelos de Visão Multimodal | pass | `ChatInputArea.js` implementa picker de arquivos, paste, drag & drop, validação MIME/10MB e visualização de miniaturas; suíte `chat-client-components.test.js` validou regras e renderização (exit code 0). | aprovado pelo workflow-validator |
| V11 — Árvore de Mensagens, Edição de Turnos com Branching e Navegação (`< 1/N >`) | pass | `ChatMessageList.js`, `ChatMessageItem.js` e `ChatPageClient.js` implementam resolução determinística de caminho na árvore (`resolveActiveConversationPath`), bifurcação em edição e paginação `< 1/N >`; testados em `chat-client-components.test.js` (exit code 0). | aprovado pelo workflow-validator |
| V12 — Interrupção de Streaming (Stop Generating) e Modal de System Prompt | pass | `ChatPageClient.js` gerencia `AbortController`, preservação de texto parcial após cancelamento via `PATCH`, modal `SystemPromptModal.js` com persistência e badge no `ChatHeader.js`; validados em `chat-client-components.test.js` (exit code 0). | aprovado pelo workflow-validator |
| V13 — Fluxo E2E Integrado da Tela de Chat e Verificação de Regressão Geral | pass | Suíte `chat-e2e-flow.test.js` passou com sucesso cobrindo o ciclo de vida completo; 7 suítes (79 testes) passaram 100% no Vitest; `npm run build` gerou todas as rotas estáticas e dinâmicas perfeitamente com exit code 0. | aprovado pelo workflow-validator |

## Regras de Promoção e Invalidação

- **Promoção:** um item só vira `pass` com evidência prática registrada (saída observável + exit code) e conferência positiva item a item do `workflow-validator`.
- **Bloqueio:** itens `pending`/`fail` bloqueiam `converged` (Root Completion Gate do loop) e merge; item `fail` dispara correção via worker e revalidação.
- **Cascata (C2/D6):** mudança substantiva em `spec.md` ou `plan.md` rebaixa este documento para `draft` e o guardian para `pending`, e **todos** os itens `pass` anteriores voltam a `pending` (evidência antiga deixa de contar; aprovação vale só para a revisão lida) até revalidação.
- **Atualização:** a cada mudança de status/evidência, atualiza `Updated:` no cabeçalho e reflete no `Validation Progress`.
- **Limite de escrita:** este arquivo é editado somente pelo manager de execução/loop (allowlist); nunca entra em write set de workers paralelos (arquivo único compartilhado).

## Skill Extraction

- **Candidato:** nenhum procedimento repetitivo requer extração no momento. As validações de modelos Mongoose, rotas Next.js App Router e testes Vitest utilizam os padrões já estabelecidos no repositório.

## Guardian Review

Status: approved
Questions:
- none
Critiques:
- none
Required Changes:
- none

## Resume Point

- Last completed action: Formulação inicial do Validation Plan cobrindo 100% dos requisitos (R1-R13) e superfícies de alteração (V1-V13).
- Next action: Revisão pelo artifact-guardian no manager orquestrado.
- Current blockers: none
