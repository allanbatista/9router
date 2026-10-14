# Chat Screen with History

Status: ready
Created: 2026-08-22 22:01
Updated: 2026-08-23 00:00

## Objective

Implementar uma tela de chat completa no 9Router com experiência, layout e histórico de conversas estilo ChatGPT, incluindo barra lateral colapsável de conversas organizadas cronologicamente, criação de novos chats, renomeação e exclusão de sessões, renderização rica de Markdown com blocos de código e botão de cópia, streaming SSE com botão Stop, seletor de modelos e Combos conectados, anexo de imagens (visão), edição de turnos anteriores com branching de mensagens e customização de system prompt por conversa, tudo com persistência de sessões no MongoDB do servidor.

## Context

Atualmente o 9Router possui uma implementação preliminar em `src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js` que armazena conversas de forma efêmera no `localStorage` do navegador e exibe o histórico apenas através de um menu popover suspenso. Além disso, a tela atual não possui link direto na barra lateral principal (`Sidebar.js`), tenta chamar um endpoint `/api/dashboard/chat/completions` inexistente, e renderiza o texto em formato plano sem Markdown avançado.

A nova tela fornecerá uma interface moderna, completa e responsiva equivalente ao ChatGPT em `/dashboard/chat` (com redirecionamento automático da rota legada `/dashboard/basic-chat`), integrada ao ecossistema de provedores e combos do 9Router, com persistência robusta em MongoDB e endpoint de streaming autenticado pela sessão do dashboard.

## Discovery Ledger

| ID | Source | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| D1 | `src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js:8-13, 638-656, 742-965` | Tela atual de basic-chat armazena sessões em `localStorage` (`basic-chat.sessions`), consome `/api/dashboard/chat/completions` (que não existe como rota dedicada) e renderiza histórico em menu popover suspenso sem layout de sidebar ChatGPT. | `globalThis.localStorage.getItem(STORAGE_KEYS.sessions)` e `fetch("/api/dashboard/chat/completions")` em `BasicChatPageClient.js` | É necessário estruturar a tela com sidebar lateral colapsável, organização cronológica, markdown rico, suporte a branching e rota de chat funcional. | confirmed |
| D2 | `src/shared/components/Sidebar.js:20-40, 159-290` | A navegação do dashboard (`Sidebar.js`) possui itens para Usage, Requests, Endpoint, Providers, Combos, Quota, etc., mas não possui item de menu para Chat. | `const navItems = [...]` em `src/shared/components/Sidebar.js` | O acesso à nova tela `/dashboard/chat` deve ser adicionado à barra de navegação principal (`navItems`) com ícone `forum`. | confirmed |
| D3 | `src/shared/components/layouts/DashboardLayout.js:98-99` | O layout do dashboard aplica regra especial para `pathname === "/dashboard/basic-chat"` removendo padding externo para permitir ocupação total da viewport. | `pathname === "/dashboard/basic-chat" ? "" : "p-6 lg:p-10"` em `DashboardLayout.js` | A nova rota `/dashboard/chat` deve receber a mesma regra de desativação de padding externo para ocupar 100% da viewport sem rolagem dupla. | confirmed |
| D4 | `src/lib/db/connection.js`, `src/lib/db/models/index.js:1-13`, `src/lib/db/repos/*` | 9Router utiliza MongoDB/Mongoose para persistência de dados (`ApiKey`, `Setting`, `ProviderConnection`, `RequestDetail`, etc.), mas não possui modelos para sessões ou mensagens de chat. | `mongoose.model(...)` e `src/lib/db/models/index.js` | Persistência multi-dispositivo no servidor requer modelo `ChatSession` no MongoDB (`src/lib/db/models/ChatSession.js`), exportação no `models/index.js`, repositório `src/lib/db/repos/chatSessionsRepo.js` e rotas `/api/chat/sessions`. | confirmed |
| D5 | `src/sse/handlers/chat.js:55-104` & `src/app/api/v1/chat/completions/route.js` | `handleChat` processa streaming SSE para chat completions. Quando `requireApiKey` está ativo, requisições sem API key são rejeitadas com 401 Unauthorized. | `if (settings.requireApiKey) { ... }` em `src/sse/handlers/chat.js:89-99` | A requisição de chat do dashboard deve ser atendida pelo endpoint `/api/dashboard/chat/completions` que valida a sessão do dashboard (se login estiver ativo) e delega ao `handleChat` com bypass de chave manual ou autorização interna. | confirmed |
| D6 | `src/app/api/providers/route.js` & `src/app/api/providers/[id]/models/route.js` & `src/app/api/combos/route.js` | Existem rotas para listar conexões ativas, modelos estáticos/dinâmicos e combos configurados. | `GET /api/providers`, `GET /api/providers/[id]/models`, `GET /api/combos` | O seletor de modelos da tela de chat deve carregar e agrupar modelos por provedor e listar combos ativos configurados como opções selecionáveis. | confirmed |
| D7 | `package.json:34` & `src/shared/components/ChangelogModal.js:6-9` | O pacote `marked` (^18.0.1) já está instalado e configurado no projeto para renderização de Markdown com GitHub Flavored Markdown (GFM). | `"marked": "^18.0.1"` em `package.json` | A renderização de respostas do assistente utilizará `marked` para suportar títulos, listas, tabelas e blocos de código com destaque e botão de cópia. | confirmed |

## Intent Classification

- User intent: end-to-end feature
- Rationale: O usuário solicitou planejar a criação de uma nova tela de chat com histórico no estilo ChatGPT ("planeje a criação de uma nova tela de chat com chat history (igual chat gpt)"), confirmando escopo expandido (sidebar cronológica, branching de turnos, system prompt, seletor de combos/provedores, anexos de imagem, streaming SSE com parada e persistência MongoDB no servidor).
- Coverage expectation: full end-to-end contract

## Actors and Flows

- Actors/systems affected:
  - Usuário do Dashboard: Interage com a interface de chat, gerencia sessões na barra lateral, customiza system prompt, edita turnos com branching, anexa imagens e envia mensagens com streaming.
  - Frontend Chat Client (`/dashboard/chat`): Gerencia o estado da sessão ativa, árvore/branching de mensagens, lista de sessões, streaming SSE, anexos de imagem e renderização Markdown.
  - Backend API (`/api/chat/sessions` e `/api/dashboard/chat/completions`): Fornece endpoints CRUD para persistência de sessões no MongoDB e rota de streaming integrada ao `handleChat` com autenticação do dashboard.
  - Persistence Layer (MongoDB / `ChatSession` / `chatSessionsRepo.js`): Persiste o estado completo de sessões, metadados, system prompt e árvore/histórico de mensagens.
  - Providers & Combos (`handleChat` / `chatCore`): Executa o roteamento, fallback e inferência nos provedores configurados.

- Current flow:
  1. O usuário acessa `/dashboard/basic-chat` (sem link na sidebar principal — D2).
  2. A tela carrega sessões do `localStorage` do navegador (D1).
  3. O usuário seleciona provedor/modelo e digita uma mensagem.
  4. O frontend envia POST para `/api/dashboard/chat/completions` que falha por inexistência de rota dedicada (D1).
  5. O histórico fica oculto em um dropdown popover no cabeçalho (D1).

- Target flow:
  1. O usuário clica no item "Chat" na barra lateral de navegação do dashboard (`Sidebar.js`) ou acessa `/dashboard/chat` (acessos a `/dashboard/basic-chat` são redirecionados automaticamente para `/dashboard/chat`).
  2. A tela `/dashboard/chat` é aberta com layout em duas colunas: Sidebar lateral com histórico de chats (agrupados por Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, Anteriores) e área central de conversação.
  3. As sessões são sincronizadas com o servidor via `GET /api/chat/sessions`.
  4. Ao clicar em "+ Novo Chat", uma nova sessão é criada no MongoDB via `POST /api/chat/sessions` com o modelo/combo padrão ou selecionado e system prompt opcional.
  5. O usuário envia uma mensagem (com suporte a anexos de imagem). O frontend envia `POST /api/dashboard/chat/completions` autenticado via sessão do dashboard e recebe o streaming SSE em tempo real, atualizando o histórico no MongoDB ao finalizar.
  6. O usuário pode editar turnos de mensagens anteriores (gerando branching de mensagens com navegação entre versões 1/N), ajustar o system prompt da conversa, renomear títulos e excluir sessões.

## Scope

- Inclusão de item de navegação "Chat" em `src/shared/components/Sidebar.js` (`navItems`, ícone `forum`, rota `/dashboard/chat`) e ajuste de padding no `DashboardLayout.js`.
- Criação da página `/dashboard/chat` e redirecionamento de `/dashboard/basic-chat` para `/dashboard/chat`.
- Barra lateral de histórico estilo ChatGPT com:
  - Botão "+ Novo Chat" / "+ New Chat".
  - Agrupamento temporal de sessões (Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, Anteriores).
  - Ações por sessão: selecionar, renomear título inline e excluir com confirmação.
  - Botão de recolher/expandir barra lateral (com suporte a drawer overlay responsivo em telas mobile).
- Cabeçalho de conversa:
  - Seletor dropdown com busca de modelos de provedores conectados e Combos ativos.
  - Botão de configuração do System Prompt customizado da conversa ativa.
- Área central de mensagens:
  - Balões de mensagem do usuário alinhados à direita com miniaturas de imagens anexadas e botão de edição de mensagem.
  - Mensagens do assistente com avatar do modelo/combo, renderização Markdown rica (`marked`), blocos de código com botão de cópia ("Copy code") e indicador visual de digitação durante streaming.
  - Suporte a branching de turnos de mensagens: ao editar uma mensagem do usuário, cria-se uma nova ramificação permitindo navegar entre variantes (`< 1/2 >`).
  - Botão de parada de geração ("Stop generating") durante o streaming ativo.
- Caixa de entrada inferior (prompt box):
  - Textarea com auto-resize e envio por Enter (Shift+Enter para quebra de linha).
  - Botão de anexo de imagens (com preview e remoção antes do envio).
  - Botão de envio com alternância para botão de Parar durante streaming.
- Persistência no MongoDB:
  - Modelo `ChatSession` (`src/lib/db/models/ChatSession.js`) com suporte a metadados, system prompt, mensagens estruturadas com IDs e parentId/branching.
  - Repositório `chatSessionsRepo.js` (`src/lib/db/repos/chatSessionsRepo.js`) com métodos de CRUD e atualização de mensagens.
  - Rotas de API `/api/chat/sessions` e `/api/chat/sessions/[id]`.
- Endpoint de streaming de chat:
  - Rota `/api/dashboard/chat/completions` integrada ao `handleChat`, validando a sessão autenticada do dashboard quando aplicável.

## Scope Size Estimate

- New surfaces beyond the literal request:
  - 1 nova rota de página frontend (`/dashboard/chat`) e componentes de UI (`ChatSidebar`, `ChatMessage`, `ChatInput`, `ModelSelector`, `SystemPromptModal`).
  - 1 redirecionamento de rota legada (`/dashboard/basic-chat` -> `/dashboard/chat`).
  - 2 novos arquivos de rotas de API (`/api/dashboard/chat/completions/route.js`, `/api/chat/sessions/route.js`, `/api/chat/sessions/[id]/route.js`).
  - 1 novo modelo e 1 novo repositório MongoDB (`ChatSession.js`, `chatSessionsRepo.js`).
- Estimated files: product: 8-11, tests: 4-5, docs/CI: 1
- Estimated lines: product: ~1200-1800, tests: ~500-800
- Vs literal request: 1.5x expansion (escopo expandido estilo ChatGPT com branching, system prompt e persistência MongoDB no servidor).
- User confirmed expansion: yes — decisions [C1], [C2], [C3], [C4], [C5] origin: user.

## Out of Scope

- Geração e upload de áudio/voz em tempo real (WebRTC / áudio bidirecional).
- Exportação de histórico para PDF/Word (apenas visualização, renomeação, branching e exclusão).
- Suporte a plugins externos/MCP na interface de chat do dashboard (reservado para futuras fases).
- Autenticação multi-tenant com isolamento estrito de múltiplos usuários (segue o modelo de tenant único/admin do 9Router).

## Questions and Decisions

- [C1] Q: Qual deve ser a rota principal e o posicionamento da nova tela de chat na navegação?
  - A: Rota canônica `/dashboard/chat` incluída na Sidebar principal (`Sidebar.js` em `navItems` com ícone `forum`), com redirecionamento automático de `/dashboard/basic-chat` para `/dashboard/chat`. — origin: user
- [C2] Q: Onde deve ser persistido o histórico de conversas?
  - A: Persistência no servidor via MongoDB utilizando modelo `ChatSession`, repositório `chatSessionsRepo.js` e rotas de API `/api/chat/sessions` e `/api/chat/sessions/[id]`. — origin: user
- [C3] Q: Qual endpoint e estratégia de autenticação devem ser usados para o streaming de inferência na tela de chat?
  - A: Rota `/api/dashboard/chat/completions` integrada ao `handleChat` utilizando a autenticação da sessão do dashboard (sem necessidade de chave de API manual). — origin: user
- [C4] Q: Qual o escopo detalhado de funcionalidades visuais e de interação da tela estilo ChatGPT para a V1?
  - A: Escopo expandido estilo ChatGPT: sidebar colapsável com histórico cronológico, Novo Chat, renomeação/exclusão de sessões, Markdown rico com blocos de código e botão de cópia, streaming SSE com botão Stop, seletor de modelos/combos, anexo de imagens, edição de turnos com branching de mensagens e system prompt customizado por conversa. — origin: user
- [C5] Q: O seletor de modelos da tela de chat deve disponibilizar Combos além dos modelos individuais de provedores?
  - A: Sim, o seletor deve suportar modelos diretos de provedores conectados e Combos ativos configurados no 9Router. — origin: user

## Requirements Traceability

| Need | Requirement (EARS) | Acceptance criterion (Given/When/Then) | Validation surface | Basis | Status |
|---|---|---|---|---|---|
| Acesso pelo Menu Principal | When the user views the dashboard navigation sidebar, the system must display a dedicated "Chat" navigation item linking to `/dashboard/chat`. | Given the dashboard sidebar, When the user clicks on "Chat", Then the application navigates to `/dashboard/chat` with full viewport height without double scrolling. | frontend/browser | D2, D3, [C1] | defined |
| Redirecionamento de Rota Legada | When the user navigates to `/dashboard/basic-chat`, the system must redirect the user to `/dashboard/chat`. | Given the URL `/dashboard/basic-chat`, When accessed, Then the browser redirects automatically to `/dashboard/chat`. | frontend/browser | D1, [C1] | defined |
| Layout ChatGPT com Sidebar Cronológica | While on `/dashboard/chat`, the system must display a collapsible sidebar listing chat sessions grouped chronologically (Today, Yesterday, Previous 7 Days, Previous 30 Days, Older) and a "+ New Chat" button. | Given the chat page loaded, When historical sessions exist, Then they are displayed grouped into chronological categories with a "+ New Chat" button at top. | frontend/browser | D1, [C4] | defined |
| Criação e Gestão de Sessões no MongoDB | When the user triggers "+ New Chat", the system must persist a new session in MongoDB via `/api/chat/sessions`, set it as active, and reset the chat area. | Given an existing conversation, When the user clicks "+ New Chat", Then a new session is created on the server and selected as active with empty messages. | frontend/API/persistence | D4, [C2] | defined |
| Renomeação e Exclusão de Sessões | When the user renames or deletes a session from the sidebar, the system must persist the title update (`PATCH /api/chat/sessions/[id]`) or deletion (`DELETE /api/chat/sessions/[id]`) in MongoDB and update the UI. | Given a session in the sidebar, When the user updates its title or confirms deletion, Then the change is persisted in MongoDB and reflected in the sidebar list immediately. | frontend/API/persistence | D4, [C2], [C4] | defined |
| Streaming SSE via Dashboard Endpoint | When the user submits a message, the system must stream tokens in real-time via `POST /api/dashboard/chat/completions` using the dashboard session authentication. | Given a prompt entered by the user, When sent, Then the assistant response streams incrementally token by token into the message bubble via SSE. | frontend/API | D5, [C3] | defined |
| Renderização Markdown e Blocos de Código | The system must render assistant responses using Markdown (`marked`) with formatted headers, lists, tables, and syntax code blocks containing a "Copy code" button. | Given an assistant message containing markdown code fences, When rendered, Then syntax styling and a functioning "Copy code" button copying the code snippet are displayed. | frontend/browser | D7, [C4] | defined |
| Interrupção de Geração (Stop) | While streaming is active, the system must display a "Stop generating" button that aborts the SSE request and preserves the generated partial content. | Given an active streaming response, When the user clicks "Stop generating", Then the SSE stream aborts and the received partial response is saved to the session. | frontend/browser/persistence | D1, [C4] | defined |
| Seletor de Modelos e Combos | The system must provide a dropdown selector allowing the user to choose between direct models from connected providers and active Combos. | Given connected providers and configured combos, When opening the model selector, Then both direct provider models and active combos appear grouped and selectable. | frontend/browser | D6, [C5] | defined |
| Anexo de Imagens (Visão) | Where the user attaches images to a message, the system must display image previews in the user message bubble and transmit them to multimodal models. | Given an image attached to the prompt, When submitted, Then the image thumbnail renders in the message turn and the image payload is sent to the backend. | frontend/browser/API | D1, [C4] | defined |
| Edição de Turnos e Branching | When the user edits a previous user turn, the system must create a new branch of messages and allow navigating between alternative turns (`< 1/N >`). | Given a conversation with multiple turns, When the user edits an earlier prompt and resubmits, Then a new assistant response is generated and version controls (`< 1/2 >`) appear on that turn. | frontend/browser/persistence | [C4] | defined |
| System Prompt Customizado por Conversa | Where configured by the user, the system must persist and include a conversation-specific system prompt in completion requests. | Given a chat session, When the user configures a custom system prompt via the chat settings, Then subsequent completion requests in that session prepend the system message. | frontend/API/persistence | [C4] | defined |
| Persistência Completa de Histórico | The system must restore all sessions, messages, branches, and system prompts from MongoDB upon loading the chat screen. | Given an existing multi-turn chat session with edits, When the user selects it or reloads the page, Then the full conversation tree and active branch are restored from MongoDB. | frontend/backend/persistence | D4, [C2] | defined |

## Contract and Persistence

- Changed contracts:
  - Novo endpoint de chat para o dashboard: `POST /api/dashboard/chat/completions` (OpenAI-compatible request body: `{ model, messages, stream: true, ... }` com retorno `text/event-stream`).
  - Endpoints de persistência de sessões no servidor:
    - `GET /api/chat/sessions` -> `{ sessions: Array<{ id, title, modelId, providerId, systemPrompt, createdAt, updatedAt }> }`
    - `POST /api/chat/sessions` -> `{ session: { id, title, modelId, providerId, systemPrompt, messages, createdAt, updatedAt } }`
    - `GET /api/chat/sessions/[id]` -> `{ session: { id, title, modelId, providerId, systemPrompt, messages, createdAt, updatedAt } }`
    - `PATCH /api/chat/sessions/[id]` -> `{ session: { id, title, modelId, providerId, systemPrompt, messages, updatedAt } }`
    - `DELETE /api/chat/sessions/[id]` -> `{ success: true }`
- Persistence:
  - Coleção MongoDB `chatSessions` com o modelo Mongoose `ChatSession` (`src/lib/db/models/ChatSession.js`):
    - `_id`: String UUIDv4.
    - `title`: String.
    - `modelId`: String (ex: `gpt-4o`, `claude-3-5-sonnet`, `combo:smart-code`).
    - `providerId`: String ou null.
    - `systemPrompt`: String (opcional).
    - `messages`: Array de subdocumentos com `id`, `parentId`, `role`, `content`, `attachments`, `createdAt`.
    - `createdAt`: Date.
    - `updatedAt`: Date.
  - Repositório `src/lib/db/repos/chatSessionsRepo.js` com funções: `getChatSessions()`, `getChatSessionById(id)`, `createChatSession(data)`, `updateChatSession(id, data)`, `deleteChatSession(id)`.
- Validation surfaces: frontend/browser, API, backend/persistence
- Ambiguities: none (todas as decisões [C1]-[C5] foram resolvidas pelo usuário).

## Shared Contract

> Minimum contract between UI (`batista-ux`) and Backend/Architecture (`batista-arch`) before parallel execution.

- Status: closed
- Payloads/fields:
  - `ChatSessionSummary`: `{ id: string, title: string, modelId: string, providerId: string | null, systemPrompt?: string, messageCount: number, createdAt: string, updatedAt: string }`
  - `ChatMessageNode`: `{ id: string, parentId: string | null, role: "user" | "assistant" | "system", content: string, attachments?: Array<{ id: string, name: string, type: string, dataUrl: string }>, createdAt: string }`
  - `ChatSessionDetail`: `{ id: string, title: string, modelId: string, providerId: string | null, systemPrompt?: string, messages: ChatMessageNode[], createdAt: string, updatedAt: string }`
  - `ChatCompletionRequest`: `{ model: string, messages: Array<{ role: string, content: string | Array<object> }>, stream: true }`
- States and errors:
  - HTTP 200: SSE stream iniciado com headers `Content-Type: text/event-stream; charset=utf-8`, chunks no formato `data: {"choices":[{"delta":{"content":"..."}}]}` e encerramento com `data: [DONE]`.
  - HTTP 400: `{"error": "Missing model"}` ou `{"error": "Invalid request body"}`.
  - HTTP 401: `{"error": "Unauthorized"}` (quando requireLogin=true e sessão inválida).
  - HTTP 404: `{"error": "Session not found"}`.
  - HTTP 500: `{"error": "Provider inference failed", "message": "..."}`.
- Minimum sequence:
  1. Ao carregar a página `/dashboard/chat`, o frontend faz `GET /api/chat/sessions` para popular a sidebar cronológica e `GET /api/providers` + `GET /api/combos` para o seletor.
  2. Ao selecionar uma sessão existente, faz `GET /api/chat/sessions/[id]` para restaurar mensagens e branches; ao clicar em "+ Novo Chat", faz `POST /api/chat/sessions`.
  3. Ao submeter mensagem/edição de turno, o frontend adiciona a mensagem localmente, invoca `POST /api/dashboard/chat/completions` para receber o stream SSE e atualiza a mensagem do assistente.
  4. Ao finalizar o stream (ou interrupção via Stop), o frontend sincroniza o estado da sessão via `PATCH /api/chat/sessions/[id]`.
  5. Ao renomear ou excluir sessão na sidebar, o frontend chama `PATCH /api/chat/sessions/[id]` ou `DELETE /api/chat/sessions/[id]`.
- Basis: D1, D4, D5, D6, D7, [C1], [C2], [C3], [C4], [C5]

## Acceptance Criteria

- Given o usuário navegando no Dashboard do 9Router, When visualiza a barra lateral (`Sidebar.js`), Then o item "Chat" (ícone `forum`) está visível em `navItems` e direciona para `/dashboard/chat`.
- Given um acesso à rota legada `/dashboard/basic-chat`, When a URL é requisitada, Then o sistema redireciona automaticamente para `/dashboard/chat`.
- Given a tela `/dashboard/chat` carregada, When renderizada, Then a barra lateral esquerda exibe as sessões anteriores agrupadas por períodos de tempo ("Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older") e o botão "+ New Chat".
- Given a visualização do chat, When o usuário clica no botão de colapsar da sidebar, Then a barra lateral recolhe suavemente, expandindo a área central de conversa.
- Given uma sessão com mensagens, When o usuário clica no botão "+ New Chat", Then uma nova sessão é criada no MongoDB via `POST /api/chat/sessions`, selecionada como ativa e o campo de digitação fica pronto para nova entrada.
- Given uma sessão na lista lateral, When o usuário edita o título inline ou confirma a exclusão, Then o MongoDB atualiza o título ou deleta o documento e a lista da sidebar reflete a alteração imediatamente.
- Given o seletor de modelos no cabeçalho do chat, When aberto pelo usuário, Then exibe modelos de provedores conectados agrupados por provedor e Combos ativos cadastrados.
- Given a conversa ativa, When o usuário clica no botão de System Prompt e define instruções personalizadas, Then o system prompt é salvo na sessão e enviado nas próximas inferências.
- Given o usuário digita uma mensagem e pressiona Enter, When a requisição é enviada, Then a resposta do modelo é recebida e renderizada token a token em tempo real via streaming SSE sem travar a interface.
- Given uma resposta do assistente contendo blocos de código Markdown, When a mensagem é renderizada, Then o código aparece formatado com destaque visual e um botão "Copy code" funcional.
- Given uma geração de resposta em andamento, When o usuário clica no botão "Stop generating", Then o streaming é interrompido imediatamente e o texto gerado até o momento é preservado no histórico do MongoDB.
- Given um modelo com suporte a visão selecionado, When o usuário anexa uma imagem e envia a mensagem, Then a miniatura da imagem é exibida no balão do usuário e enviada no payload de completude.
- Given um turno anterior de mensagem do usuário, When o usuário clica em editar e reenvia, Then uma nova ramificação (branch) é criada e controles de navegação (`< 1/2 >`) permitem alternar entre as versões da conversa.

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

- [x] Complete product result definido e fechado com as decisões do usuário.
- [x] Discovery e rastreabilidade suportam escopo e critérios de aceitação.
- [x] Contratos públicos/internos alterados estão explicitamente listados.
- [x] Validação prática com evidências reais definidas para frontend, backend e persistência.
- [x] Testes automatizados necessários definidos para as rotas e componentes.
- [x] Evidências obrigatórias para frontend, backend e infraestrutura documentadas.
- [x] Guardian aprovou a especificação.
