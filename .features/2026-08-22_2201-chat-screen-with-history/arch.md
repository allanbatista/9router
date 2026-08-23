# Chat Screen with History — Architecture

Status: ready
Spec: ./spec.md
Created: 2026-08-23 00:30
Updated: 2026-08-23 00:30

## Applicability

- Backend affected: yes — evidence: spec Validation surfaces cover MongoDB `ChatSession` persistence model, repository `chatSessionsRepo.js`, database barrel/backup integration (`src/lib/db/index.js`, `src/lib/localDb.js`), REST endpoints (`/api/chat/sessions`, `/api/chat/sessions/[id]`), dashboard streaming inference endpoint (`/api/dashboard/chat/completions`), and routing/navigation layout integrations (`Sidebar.js`, `DashboardLayout.js`, `basic-chat` redirect).

## Architecture Ledger

| ID | Source | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| A1 | `src/lib/db/models/index.js:1-13` & `src/lib/db/connection.js:1-75` | 9Router utiliza Mongoose com schemas flexíveis (`_id: String UUID`, `timestamps: false`, `strict: false`) para persistência MongoDB, sem modelo para sessões de chat. | Modelos `Combo.js`, `ApiKey.js` em `src/lib/db/models/` | Criar `ChatSession.js` (`src/lib/db/models/ChatSession.js`) com suporte a mensagens em árvore (`parentId`), metadados, system prompt e índice `{ updatedAt: -1 }`. Exportar em `models/index.js`. | confirmed |
| A2 | `src/lib/db/repos/*` | O padrão de repositórios do 9Router encapsula operações Mongoose com métodos lean (`docToModel`, `getConnection()`, `find`, `findByIdAndUpdate`, `deleteOne`). | `src/lib/db/repos/combosRepo.js`, `apiKeysRepo.js` | Criar `chatSessionsRepo.js` com funções `getChatSessions`, `getChatSessionById`, `createChatSession`, `updateChatSession`, `deleteChatSession`, `exportChatSessions`, `importChatSessions`. | confirmed |
| A3 | `src/lib/db/index.js:1-353` & `src/lib/localDb.js:1-21` | O arquivo `src/lib/db/index.js` atua como barrel público de banco de dados e gerencia exportação/importação integral de dados (`exportDb`/`importDb`). | `exportDb()` e `importDb()` em `src/lib/db/index.js` | Exportar métodos de `chatSessionsRepo` no barrel `db/index.js` e `localDb.js`, e incluir a coleção `chatSessions` no fluxo de backup `exportDb`/`importDb`. | confirmed |
| A4 | `src/sse/handlers/chat.js:55-181` & `src/dashboardGuard.js:49-68, 201-278` | `handleChat` exige API key quando `requireApiKey: true`. O proxy `dashboardGuard` já protege todas as rotas `/api/*` com sessão do dashboard quando `requireLogin: true`. | `if (settings.requireApiKey) { ... }` em `chat.js:89` | Criar endpoint `POST /api/dashboard/chat/completions` que verifica autenticação da sessão do dashboard e delega para `handleChat` com bypass de chave de API interna (`isDashboardSession: true`). | confirmed |
| A5 | `src/shared/components/Sidebar.js:20-29` & `DashboardLayout.js:98-100` | A navegação do dashboard possui lista `navItems`, e `DashboardLayout` remove padding externo apenas para a rota `/dashboard/basic-chat`. | `pathname === "/dashboard/basic-chat" ? "" : "p-6 lg:p-10"` em `DashboardLayout.js` | Adicionar `{ href: "/dashboard/chat", label: "Chat", icon: "forum" }` em `Sidebar.js` e incluir `/dashboard/chat` na remoção de padding do `DashboardLayout` para tela cheia sem scroll duplo. | confirmed |
| A6 | `src/app/(dashboard)/dashboard/basic-chat/page.js:1-5` | A rota `/dashboard/basic-chat` ainda aponta para o cliente legado com `localStorage`. | `src/app/(dashboard)/dashboard/basic-chat/page.js` | Atualizar `page.js` de `basic-chat` para realizar redirecionamento automático (`redirect("/dashboard/chat")`). | confirmed |
| A7 | `open-sse/handlers/chatCore/streamingHandler.js:46-183` & `src/sse/handlers/chat.js` | A inferência por streaming SSE permite cancelamento pelo cliente e entrega chunks `text/event-stream` no formato delta OpenAI. | `createSSETransformStreamWithLogger` em `streamingHandler.js` | O cliente de chat no frontend utilizará `AbortController` para interromper o streaming no botão "Stop", preservando os tokens acumulados e persistindo o estado parcial via `PATCH /api/chat/sessions/[id]`. | confirmed |

## Approach (ADR-lite)

- Chosen: **Persistência de Árvore de Mensagens em Documento Único com `parentId` (Branching O(1)) + Repositório Dedicado Mongoose + Endpoint de Inferência de Dashboard Autenticado por Sessão**.
  - **Data Structure**: Cada sessão de chat é um documento único na coleção `chatSessions`. As mensagens são armazenadas em um array plano de nós (`messages: [{ id, parentId, role, content, attachments, createdAt }]`). O root possui `parentId: null`. Ao editar um turno anterior, cria-se um novo nó de mensagem com o mesmo `parentId`, gerando um novo branch sem sobrescrever nem duplicar os nós antecedentes. A interface reconstrói a árvore de conversa ativa em $O(N)$ no cliente e permite navegação de variantes (`< 1/N >`).
  - **API Endpoints**: Rotas RESTful `/api/chat/sessions` e `/api/chat/sessions/[id]` para CRUD de sessões. Listagens da sidebar realizam query projetada (sem o array pesado de mensagens ou com contagem de mensagens) ordenada por `updatedAt: -1` para carregamento instantâneo.
  - **Inference Streaming**: Rota dedicada `/api/dashboard/chat/completions` protegida pelo guard de sessão do dashboard, que executa o pipeline `handleChat` com bypass de chave de API manual, permitindo streaming SSE transparente tanto para modelos individuais quanto para Combos.
- Alternatives:
  - *Alternative A: Armazenamento linear de mensagens sem suporte a branching (array simples `{ role, content }`)*. Rejeitado: Incompatível com o requisito de edição de mensagens anteriores com histórico de ramificações estilo ChatGPT (EARS requirement e decisão [C4]).
  - *Alternative B: Coleção MongoDB separada para mensagens (`chatMessages`) com relacionamento 1:N*. Rejeitado: Adiciona complexidade desnecessária de transações/queries e latência de rede para montagem do histórico de chat, violando o princípio de minimalismo.
  - *Alternative C: Exigir API Key manual na interface do chat e chamar diretamente `/api/v1/chat/completions`*. Rejeitado: Experiência degradada para o usuário autenticado no dashboard, forçando criação e cópia manual de chaves que já são gerenciadas pelo servidor.
- Rationale: A abordagem de documento único com array plano e `parentId` é o padrão ouro para árvores de chat, unindo simplicidade de persistência atômica no MongoDB, suporte completo a branching e performance máxima de leitura e escrita.
- Tradeoffs: Para sessões excepcionalmente longas (centenas de mensagens), o documento de detalhe pode atingir algumas centenas de kilobytes; isso é mitigado pela exclusão de mensagens na query de listagem da barra lateral (`getChatSessions`).

## Component Boundaries

- `src/lib/db/models/ChatSession.js` (Novo Modelo Mongoose):
  - Responsabilidade: Schema de dados de sessões e nós de mensagens, índices de ordenação (`updatedAt: -1`) e invariantes de tipos.
- `src/lib/db/repos/chatSessionsRepo.js` (Novo Repositório):
  - Responsabilidade: Funções de acesso e mutação (`getChatSessions`, `getChatSessionById`, `createChatSession`, `updateChatSession`, `deleteChatSession`, `exportChatSessions`, `importChatSessions`).
- `src/lib/db/index.js` & `src/lib/localDb.js` (Modificados):
  - Responsabilidade: Re-exportar funções do repositório de chat e incluir `chatSessions` nas rotinas de backup `exportDb` e `importDb`.
- `src/app/api/chat/sessions/route.js` & `src/app/api/chat/sessions/[id]/route.js` (Novas Rotas API):
  - Responsabilidade: Handlers HTTP para listagem, criação, leitura, atualização e exclusão de sessões.
- `src/app/api/dashboard/chat/completions/route.js` (Nova Rota API):
  - Responsabilidade: Validação da sessão de autenticação do dashboard e invocação do pipeline `handleChat` com resposta SSE.
- `src/sse/handlers/chat.js` (Modificado):
  - Responsabilidade: Suportar flag/contexto interno de autorização de sessão do dashboard (`isDashboardSession: true`) para bypass de validação de API Key manual quando executado via dashboard interno.
- `src/app/(dashboard)/dashboard/chat/page.js` & `ChatPageClient.js` (Nova Página Frontend):
  - Responsabilidade: Página principal de chat com sidebar colapsável, agrupamento cronológico, seleção de modelos/combos, modal de system prompt, caixa de prompt com auto-resize, preview de anexos, visualizador de Markdown com cópia de código e gerenciamento de streaming/branching.
- `src/app/(dashboard)/dashboard/basic-chat/page.js` (Modificado):
  - Responsabilidade: Redirecionamento permanente/temporário para `/dashboard/chat`.
- `src/shared/components/Sidebar.js` & `src/shared/components/layouts/DashboardLayout.js` (Modificados):
  - Responsabilidade: Exibição do item "Chat" na barra lateral de navegação e layout full-viewport sem padding na rota `/dashboard/chat`.

## Data Model

### `ChatSession` Schema (`chatSessions` collection)

```javascript
// src/lib/db/models/ChatSession.js
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const { Schema } = mongoose;

export const ChatMessageSchema = new Schema(
  {
    id: { type: String, default: uuidv4 },
    parentId: { type: String, default: null },
    role: { type: String, required: true, enum: ["user", "assistant", "system"] },
    content: { type: Schema.Types.Mixed, required: true }, // String ou Array de partes (texto/visão)
    attachments: {
      type: [
        {
          id: { type: String, default: uuidv4 },
          name: { type: String, default: "" },
          type: { type: String, default: "image/png" },
          dataUrl: { type: String, required: true },
        },
      ],
      default: () => [],
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const ChatSessionSchema = new Schema(
  {
    _id: { type: String, default: uuidv4 },
    title: { type: String, default: "New chat" },
    modelId: { type: String, required: true },
    providerId: { type: String, default: null },
    systemPrompt: { type: String, default: null },
    messages: { type: [ChatMessageSchema], default: () => [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "chatSessions",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

// Indexes
ChatSessionSchema.index({ updatedAt: -1 });
ChatSessionSchema.index({ createdAt: -1 });

export const ChatSession = mongoose.models.ChatSession || mongoose.model("ChatSession", ChatSessionSchema);
export default ChatSession;
```

### Invariants & Rules

1. `_id`: String UUIDv4 único identificador da sessão.
2. `messages[i].id`: String UUIDv4 único de cada nó de mensagem.
3. `messages[i].parentId`: Identificador do nó pai. A primeira mensagem do usuário tem `parentId: null`. A resposta do assistente aponta para o `id` da mensagem do usuário.
4. `updatedAt`: Atualizado automaticamente a cada inclusão/edição de mensagem ou renomeação da sessão.

## Contract Design

### 1. `GET /api/chat/sessions`
- **Description**: Lista todas as sessões para a barra lateral, ordenadas por `updatedAt: -1`.
- **Response (200 OK)**:
```json
{
  "sessions": [
    {
      "id": "c6a1b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
      "title": "Explicação de Algoritmos de Roteamento",
      "modelId": "gpt-4o",
      "providerId": "openai",
      "systemPrompt": "Você é um assistente conciso.",
      "messageCount": 6,
      "createdAt": "2026-08-23T00:10:00.000Z",
      "updatedAt": "2026-08-23T00:25:00.000Z"
    }
  ]
}
```

### 2. `POST /api/chat/sessions`
- **Description**: Cria uma nova sessão de conversa vazia ou inicializada.
- **Request Body**:
```json
{
  "title": "New chat",
  "modelId": "gpt-4o",
  "providerId": "openai",
  "systemPrompt": null,
  "messages": []
}
```
- **Response (201 Created)**:
```json
{
  "session": {
    "id": "c6a1b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "title": "New chat",
    "modelId": "gpt-4o",
    "providerId": "openai",
    "systemPrompt": null,
    "messages": [],
    "createdAt": "2026-08-23T00:30:00.000Z",
    "updatedAt": "2026-08-23T00:30:00.000Z"
  }
}
```

### 3. `GET /api/chat/sessions/[id]`
- **Description**: Retorna o detalhe completo da sessão, incluindo a árvore de mensagens.
- **Response (200 OK)**:
```json
{
  "session": {
    "id": "c6a1b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "title": "Explicação de Algoritmos de Roteamento",
    "modelId": "gpt-4o",
    "providerId": "openai",
    "systemPrompt": "Você é um assistente conciso.",
    "messages": [
      {
        "id": "m1-uuid",
        "parentId": null,
        "role": "user",
        "content": "Como funciona o fallback em combos?",
        "attachments": [],
        "createdAt": "2026-08-23T00:10:00.000Z"
      },
      {
        "id": "m2-uuid",
        "parentId": "m1-uuid",
        "role": "assistant",
        "content": "O fallback em combos tenta o modelo primário e...",
        "attachments": [],
        "createdAt": "2026-08-23T00:10:05.000Z"
      }
    ],
    "createdAt": "2026-08-23T00:10:00.000Z",
    "updatedAt": "2026-08-23T00:10:05.000Z"
  }
}
```
- **Error (404 Not Found)**: `{ "error": "Session not found" }`

### 4. `PATCH /api/chat/sessions/[id]`
- **Description**: Atualiza metadados (`title`, `modelId`, `providerId`, `systemPrompt`) e/ou o array de mensagens (`messages`).
- **Request Body**:
```json
{
  "title": "Novo Título Renomeado",
  "systemPrompt": "Instruções atualizadas",
  "messages": [ ... ]
}
```
- **Response (200 OK)**:
```json
{
  "session": {
    "id": "c6a1b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "title": "Novo Título Renomeado",
    "modelId": "gpt-4o",
    "providerId": "openai",
    "systemPrompt": "Instruções atualizadas",
    "messages": [ ... ],
    "updatedAt": "2026-08-23T00:35:00.000Z"
  }
}
```
- **Error (404 Not Found)**: `{ "error": "Session not found" }`

### 5. `DELETE /api/chat/sessions/[id]`
- **Description**: Remove uma sessão do MongoDB.
- **Response (200 OK)**:
```json
{
  "success": true
}
```
- **Error (404 Not Found)**: `{ "error": "Session not found" }`

### 6. `POST /api/dashboard/chat/completions`
- **Description**: Endpoint de streaming de chat completions para a interface do dashboard.
- **Headers**: `Content-Type: application/json`
- **Request Body (OpenAI Standard)**:
```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "System prompt customizado" },
    { "role": "user", "content": "Olá, tudo bem?" }
  ],
  "stream": true
}
```
- **Response Headers**: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`
- **Response Stream Chunks**:
```text
data: {"choices":[{"delta":{"content":"Olá! "}}]}

data: {"choices":[{"delta":{"content":"Como posso ajudar?"}}]}

data: [DONE]
```
- **Error Responses**:
  - `401 Unauthorized`: `{ "error": "Unauthorized" }` (quando requireLogin=true e sessão inválida)
  - `400 Bad Request`: `{ "error": "Missing model" }` ou `{ "error": "Invalid JSON body" }`
  - `500 Internal Server Error`: `{ "error": "Provider inference failed", "message": "..." }`

## Interaction / Sequence

### 1. Carregamento da Tela e Criação de Sessão
```
[User Browser]          [Next.js Frontend]         [API /api/chat/sessions]       [MongoDB]
      │                         │                              │                      │
      ├─── Acessa /dashboard/chat ───>│                              │                      │
      │                         ├─── GET /api/chat/sessions ──>│                      │
      │                         │                              ├─── ChatSession.find ─>│
      │                         │                              │<── Docs list ────────┤
      │                         │<── { sessions: [...] } ──────┤                      │
      │                         ├─── Agrupa sessões (Hoje...)  │                      │
      │<── Renderiza Sidebar ───┤                              │                      │
      │                         │                              │                      │
      ├─── Clica "+ New Chat" ─>│                              │                      │
      │                         ├─── POST /api/chat/sessions ─>│                      │
      │                         │    { modelId, title }        ├─── ChatSession.create>│
      │                         │                              │<── Created doc ──────┤
      │                         │<── { session: {...} } ───────┤                      │
      │<── Chat pronto (vazio) ─┤                              │                      │
```

### 2. Envio de Mensagem, Streaming SSE e Interrupção (Stop)
```
[User]         [Chat Frontend]         [POST /api/dashboard/chat]       [LLM Provider]     [MongoDB]
  │                   │                              │                        │                │
  ├── Digita prompt ─>│                              │                        │                │
  │   + Anexo img     ├── Cria nó user (m1) local    │                        │                │
  │                   ├── Cria nó assistente (m2)    │                        │                │
  │                   ├── POST /api/dashboard/chat ─>│                        │                │
  │                   │   (messages, stream: true)   ├── stream request ─────>│                │
  │                   │                              │<── SSE Chunk (t1) ─────┤                │
  │                   │<── SSE data: {content: "A"} ─┤                        │                │
  │<── Renderiza t1 ──┤                              │<── SSE Chunk (t2) ─────┤                │
  │                   │<── SSE data: {content: "B"} ─┤                        │                │
  │<── Renderiza t2 ──┤                              │                        │                │
  │                   │                              │                        │                │
  ├── Clica "Stop" ──>│                              │                        │                │
  │                   ├── AbortController.abort() ───X (Fecha conexão SSE)    │                │
  │                   ├── Fixa conteúdo acumulado    │                        │                │
  │                   ├── PATCH /api/chat/sessions/id ────────────────────────────────────────>│
  │                   │   (messages: [m1, m2_partial])                                         │ Atualiza sessão
  │                   │<── 200 OK ─────────────────────────────────────────────────────────────┤ no MongoDB
  │<── Botão reativo ─┤                                                                        │
```

### 3. Edição de Turno Anterior com Branching de Mensagens
```
[User]                 [Chat Frontend]                                  [MongoDB]
  │                           │                                             │
  ├── Clica "Editar" em m1 ──>│ (Abre textarea inline no balão m1)          │
  ├── Altera texto e envia ──>│                                             │
  │                           ├── Cria novo nó user m3 (parentId: null)     │
  │                           │   (m1 e m3 compartilham o mesmo parentId)   │
  │                           ├── Adiciona m3 à árvore local                │
  │                           ├── Dispara streaming para nova resposta m4   │
  │                           │   (m4 aponta parentId: m3.id)               │
  │                           ├── Ao concluir streaming, sincroniza sessão: │
  │                           ├── PATCH /api/chat/sessions/[id] ───────────>│
  │                           │   (messages: [m1, m2, m3, m4])              │ Persiste todos os nós
  │                           │<── 200 OK ──────────────────────────────────┤
  │<── Exibe controles ───────┤
  │    de versão (< 2/2 >)    │
```

## Failure Modes & Rollback

- Failure Modes:
  - **Cancelamento pelo Usuário (Stop Generating)**: O cliente dispara `abort()` no `AbortController`. O stream é fechado imediatamente e o texto acumulado até o momento é salvo no MongoDB através de `PATCH /api/chat/sessions/[id]`, evitando perda de dados ou balões travados em loading.
  - **Queda de Conexão ou Erro de Provedor (5xx / Rate Limit)**: O handler SSE detecta a falha, transmite o evento de erro ou fecha o stream. A interface exibe badge de erro visual na mensagem com opção de "Retry", sem corromper a árvore de mensagens persistida.
  - **Instabilidade no MongoDB**: Se a conexão com o MongoDB falhar temporariamente, as operações no repositório retornam erro tratado (500). O frontend exibe uma notificação toast ("Erro ao sincronizar histórico") mantendo o estado na memória do componente até a próxima tentativa.
  - **Imagens Anexadas Excessivas**: Imagens enviadas como Base64 Data URL são validadas no cliente antes do upload (limite de 10MB por arquivo e tipos `image/*`), prevenindo estouro de payload HTTP e erro 413.
- Migration:
  - **Ordem de Execução**: Zero downtime. A coleção `chatSessions` e seus índices são criados sob demanda pelo Mongoose na primeira inicialização da aplicação.
  - **Backfill**: Nenhum backfill necessário, pois a funcionalidade `basic-chat` anterior armazenava dados apenas em `localStorage` efêmero do navegador do usuário.
- Rollback:
  - **Código**: `git revert` dos commits da feature restaura as rotas e componentes anteriores sem efeitos colaterais.
  - **Banco de Dados**: Como a coleção `chatSessions` é isolada, nenhuma coleção existente (`settings`, `combos`, `apiKeys`) sofre alteração estrutural ou de dados. Se desejado, a coleção `chatSessions` pode ser removida via comando MongoDB `db.chatSessions.drop()`.

## Non-Functional

- **Performance**:
  - A query de listagem `getChatSessions` exclui o array `messages` da projeção ou conta mensagens, garantindo carregamento da barra lateral em tempo constante $< 20\text{ms}$ mesmo com centenas de sessões cadastradas.
  - Renderização de Markdown usa `marked` com sanitização e parsing otimizado, evitando travamentos de UI durante o streaming rápido de tokens.
- **Segurança**:
  - A rota `/api/dashboard/chat/completions` e as rotas `/api/chat/sessions` herdam a proteção do middleware `dashboardGuard` (`requireLogin`), bloqueando acessos remotos não autenticados.
  - Sanitização de HTML no `MarkdownRenderer` previne injeções XSS via respostas maliciosas de provedores ou prompts.
- **Escalabilidade & Limites**:
  - Índices compostos no MongoDB (`{ updatedAt: -1 }`, `{ createdAt: -1 }`) garantem escalabilidade para milhares de sessões por instância.
  - Suporte a modelos multimodais de visão em conformidade com o formato OpenAI Vision (`image_url`).

## Architecture Traceability

| Requirement (EARS back) | Architectural decision | Affected contract/data | Validation | Basis | Status |
|---|---|---|---|---|---|
| Acesso pelo Menu Principal | Inclusão do item `Chat` (`forum`) em `Sidebar.js` e ajuste de layout em `DashboardLayout.js` | `src/shared/components/Sidebar.js`, `DashboardLayout.js` | Verificação visual no menu e teste de navegação para `/dashboard/chat` sem scroll duplo | A5, [C1] | defined |
| Redirecionamento de Rota Legada | Redirecionamento da rota `/dashboard/basic-chat` para `/dashboard/chat` | `src/app/(dashboard)/dashboard/basic-chat/page.js` | Teste HTTP 307/308 / redirect de `/dashboard/basic-chat` para `/dashboard/chat` | A6, [C1] | defined |
| Layout ChatGPT com Sidebar Cronológica | Sidebar com agrupamento cronológico ("Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older") e colapso responsivo | `ChatPageClient.js`, `ChatSidebar.js` | Teste de renderização de grupos temporais com fixtures de datas e teste de colapso | A5, [C4] | defined |
| Criação e Gestão de Sessões no MongoDB | Modelo `ChatSession`, repositório `chatSessionsRepo.js` e endpoint `POST /api/chat/sessions` | `ChatSession.js`, `chatSessionsRepo.js`, `/api/chat/sessions` | Teste de inserção no MongoDB e resposta HTTP 201 | A1, A2, [C2] | defined |
| Renomeação e Exclusão de Sessões | Endpoints `PATCH /api/chat/sessions/[id]` e `DELETE /api/chat/sessions/[id]` no repositório e rotas de API | `/api/chat/sessions/[id]` | Teste de atualização de título inline e exclusão de documento no MongoDB | A2, [C2], [C4] | defined |
| Streaming SSE via Dashboard Endpoint | Rota `/api/dashboard/chat/completions` com validação de sessão e streaming SSE integrado ao `handleChat` | `/api/dashboard/chat/completions`, `src/sse/handlers/chat.js` | Teste de requisição de chat com stream SSE token a token autenticado por cookie | A4, A7, [C3] | defined |
| Renderização Markdown e Blocos de Código | Componente `MarkdownRenderer` utilizando `marked` com destaque de código e botão "Copy code" | `MarkdownRenderer.js`, `package.json` | Teste de renderização de tags markdown e clique no botão de copiar código | [C4] | defined |
| Interrupção de Geração (Stop) | Utilização de `AbortController` no cliente e persistência de conteúdo parcial gerado via `PATCH` | `ChatPageClient.js`, `chatSessionsRepo.js` | Teste de abort durante streaming e verificação do conteúdo salvo no MongoDB | A7, [C4] | defined |
| Seletor de Modelos e Combos | Componente `ModelSelector` consumindo `GET /api/providers` e `GET /api/combos` | `ModelSelector.js`, `GET /api/combos`, `GET /api/providers` | Teste de renderização de lista agrupada de provedores e combos | [C5] | defined |
| Anexo de Imagens (Visão) | Suporte a upload de imagens com conversão Base64 e envio no formato OpenAI Vision `image_url` | `ChatInput.js`, `ChatMessage.js`, `/api/dashboard/chat/completions` | Teste de upload de imagem, preview no balão e envio para modelo de visão | [C4] | defined |
| Edição de Turnos e Branching | Estrutura de mensagens com `id` e `parentId` com navegação `< 1/N >` entre versões irmãs | `ChatSession.js`, `ChatMessage.js`, `ChatPageClient.js` | Teste de edição de mensagem anterior, criação de ramificação e navegação entre turnos | A1, [C4] | defined |
| System Prompt Customizado por Conversa | Campo `systemPrompt` no modelo `ChatSession` e injeção de mensagem `{ role: "system" }` na inferência | `ChatSession.js`, `SystemPromptModal.js`, `/api/dashboard/chat/completions` | Teste de configuração de system prompt e verificação de envio no payload | A1, [C4] | defined |
| Persistência Completa de Histórico | Repositório `chatSessionsRepo.js` e integração com backup `exportDb`/`importDb` | `src/lib/db/repos/chatSessionsRepo.js`, `src/lib/db/index.js` | Teste de reload de página e restauração completa de sessões, mensagens e branches | A2, A3, [C2] | defined |

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
