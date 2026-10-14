# Indexação Configurável de _agent_metadata — UX

Status: ready
Spec: ./spec.md
Created: 2026-08-22 15:30
Updated: 2026-08-22 15:30

## Applicability

- Frontend affected: yes — evidence: `spec.md:116-118,137-139` (`RequestDetailsTab.js`, `UsageStats.js`, `src/app/(dashboard)/dashboard/profile/page.js`, `src/app/(dashboard)/dashboard/requests/page.js`).

## Usability Ledger

| ID | Source | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| U1 | `RequestDetailsTab.js:307-382` | O painel de filtros atual é uma grade fixa de 5 colunas apenas com Provider e Datas. Chaves de metadados dinâmicas exigem disposição adaptativa e inputs claros para não quebrar a responsividade em telas menores. | `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5` | Inclusão de seção de filtros de metadados integrada ou expansível com inputs/selects para as chaves configuradas (`agentMetadataKeys`). | confirmed |
| U2 | `RequestDetailsTab.js:427-436` | A coluna "Request" na tabela de requisições exibe ID, `cacheKey`, `sessionId`, timestamp e status, mas não exibe os metadados de agente associados (ex.: qual SO, hostname ou agente executou). | `<div className="font-mono text-xs break-all...">{detail.id}</div>` | Renderizar badges compactos com os metadados de agente (`os`, `agent-name`, `hostname`) nas linhas da tabela para identificação imediata sem abrir o Drawer. | confirmed |
| U3 | `RequestDetailsTab.js:489-573` | O Drawer de detalhes da requisição apresenta os metadados de rede, tokens e latência, mas não possui uma seção dedicada para os metadados de agente estruturados. | `Request Details` Drawer grid `sm:grid-cols-2` | Criar bloco visual dedicado "Agent Metadata" com chave-valor legível, botão de cópia e visualização mesmo quando o corpo da conversa estiver sob redação de segurança. | confirmed |
| U4 | `profile/page.js:1616-1637` | O card "Observability" na página de perfil/configurações possui apenas o toggle de habilitar observabilidade, sem controle visual para gerenciar `agentMetadataKeys`. | `<Toggle checked={observabilityEnabled} onChange={updateObservabilityEnabled} />` | Adicionar controle de tags/chips no card de Observabilidade para visualizar, adicionar, remover e restaurar chaves padrão de metadados indexados. | confirmed |
| U5 | `profile/page.js:127-222` | Configurações do perfil utilizam feedback inline com estados de salvamento assíncrono (`loading`, mensagens de sucesso/erro em banner/texto). | `proxyStatus`, `passStatus` com mensagens coloridas | Manter padrão de feedback inline instantâneo para adição e remoção de chaves de metadados, com validação sintática prévia (impedir chaves vazias, duplicadas ou com caracteres inválidos). | confirmed |
| U6 | `UsageStats.js:195-200, 327-440` | O seletor de visualização de métricas de uso suporta apenas `model`, `account`, `apiKey` e `endpoint`. | `const TABLE_OPTIONS = [{ value: "model", ... }, { value: "account", ... }]` | Estender as opções de agregação de uso com as dimensões ativas de `agentMetadataKeys` (ex.: "Usage by Agent", "Usage by OS", "Usage by Hostname"), permitindo análise detalhada de consumo por dimensão. | confirmed |
| U7 | `RequestDetailsTab.js:290-294` | O botão "Clear Filters" limpa somente `provider`, `startDate` e `endDate`. | `const handleClearFilters = () => { setFilters({ provider: "", startDate: "", endDate: "" }); ... }` | O reset de filtros deve limpar também todos os campos de metadados aplicados, resetando a paginação para a página 1 e reabilitando a listagem completa. | confirmed |

## Affected Screens & Flows

### 1. Telas e Rotas Afetadas

1. `/dashboard/requests` (`src/app/(dashboard)/dashboard/requests/page.js` e `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`):
   - Barra de filtros com controles dinâmicos para `agentMetadataKeys` (ex.: OS, Hostname, Agent Name).
   - Tabela de requisições com badges de metadados de agente.
   - Drawer de detalhes com seção dedicada "Agent Metadata".
2. `/dashboard/profile` (`src/app/(dashboard)/dashboard/profile/page.js`):
   - Card "Observability" com gerenciador de tags `agentMetadataKeys` (adicionar nova chave, remover chave existente, botão de restaurar padrão `os`, `hostname`, `agent-name`).
3. `/dashboard/usage` (`src/app/(dashboard)/dashboard/usage/page.js` e `src/shared/components/UsageStats.js`):
   - Seletor de visualização de tabela expandido com dimensões de metadados de agentes.
   - Tabela de agregação de tokens, requisições e custo agrupada por valor de metadado.

---

### 2. Fluxos de Tarefas (Target Task Flows)

#### Fluxo 1: Gerenciar Chaves de Metadados Indexadas (Settings / Profile)
1. **Entrada**: Usuário navega para `/dashboard/profile` e rola até a seção "Observability".
2. **Visualização**: Usuário visualiza o status da Observabilidade e o bloco "Indexed Metadata Keys", listando as chaves ativas em formato de chips/tags (ex.: `[os ✕]`, `[hostname ✕]`, `[agent-name ✕]`).
3. **Adição**:
   - Usuário clica no campo de texto "Add metadata key (e.g. mode, cwd, tz)...".
   - Digita o identificador desejado (ex.: `mode`) e pressiona `Enter` ou clica no botão `+ Add`.
   - Sistema valida o formato (alfanumérico/kebab-case, sem espaços, sem `$`), adiciona o chip à lista e executa `PATCH /api/settings`.
   - Feedback de sucesso é exibido ("Metadata keys updated").
4. **Remoção**:
   - Usuário clica no ícone `✕` de uma tag existente (ex.: `hostname`).
   - Tag é removida da visualização e a configuração atualizada é salva via `PATCH /api/settings`.
5. **Restauração de Padrões**:
   - Usuário clica em "Reset to defaults" para restaurar rapidamente a lista `["os", "hostname", "agent-name"]`.

#### Fluxo 2: Filtrar e Inspecionar Requisições por Metadados (Requests)
1. **Entrada**: Usuário navega para `/dashboard/requests`.
2. **Carregamento**: O componente busca as chaves configuradas em settings (`agentMetadataKeys`) e renderiza os campos de filtro correspondentes (ex.: campos de texto/select para `OS`, `Hostname`, `Agent Name`).
3. **Aplicação de Filtros**:
   - Usuário preenche ou seleciona um valor (ex.: `Agent Name: pi`).
   - O filtro dispara a busca (`GET /api/usage/request-details?agentMetadata[agent-name]=pi`), reseta a página para 1 e exibe o estado de loading sutil.
   - A tabela atualiza exibindo apenas as requisições enviadas pelo agente `pi`.
4. **Inspeção na Tabela**:
   - Na lista, cada linha exibe pequenos badges informativos com os metadados (ex.: `pi`, `linux`, `workstation-1`).
5. **Inspeção Detalhada no Drawer**:
   - Usuário clica no botão "Detail" de uma requisição.
   - O Drawer lateral abre exibindo a seção "Agent Metadata" com todas as propriedades daquele registro (chave, valor, botão de cópia de JSON).
6. **Limpeza de Filtros**:
   - Usuário clica em "Clear Filters". Todos os campos de filtro (Provider, Datas e Metadados) são limpos e a listagem completa é recarregada.

#### Fluxo 3: Analisar Métricas de Uso por Dimensão de Agente (Usage Dashboard)
1. **Entrada**: Usuário navega para `/dashboard/usage`.
2. **Seleção de Visualização**: No dropdown "View", usuário seleciona uma dimensão de agente (ex.: "Usage by Agent Name" ou "Usage by OS").
3. **Exibição de Agregados**:
   - A tabela renderiza os grupos agregados (ex.: `pi`, `claude`, `cline`, `codex`).
   - Exibe colunas de: Total de Requisições, Tokens de Entrada (Prompt), Tokens Cacheados, Tokens de Saída (Completion), Custo Total Estimado e Última Utilização.
4. **Ordenação**:
   - Usuário clica nos cabeçalhos de coluna para ordenar por Custo, Requisições ou Tokens.

---

## Component & State Inventory

### 1. Componentes Reutilizados e Novos

| Componente | Tipo | Responsabilidade / Comportamento UX |
|---|---|---|
| `Card` (`src/shared/components/Card.js`) | Reutilizado | Container dos blocos de filtro, seções do perfil e tabelas. |
| `Button` (`src/shared/components/Button.js`) | Reutilizado | Ações de Refresh, Clear, Add Key, Reset Defaults e visualização de Detalhes. |
| `Badge` (`src/shared/components/Badge.js`) | Reutilizado | Exibição de chips de metadados na listagem de requisições e nas tags de configuração. |
| `Input` (`src/shared/components/Input.js`) | Reutilizado | Campos de texto para filtros de metadados e formulário de nova chave em Settings. |
| `Drawer` (`src/shared/components/Drawer.js`) | Reutilizado | Painel lateral de detalhes da requisição com o bloco "Agent Metadata". |
| `Pagination` (`src/shared/components/Pagination.js`) | Reutilizado | Paginação integrada à listagem filtrada. |
| `Toggle` (`src/shared/components/Toggle.js`) | Reutilizado | Habilitar/desabilitar Observabilidade. |
| `MetadataTagInput` | Novo (sub-componente) | Campo interativo para gerenciar a lista de `agentMetadataKeys` no Perfil com remoção rápida e validação sintática. |
| `MetadataFilterGroup` | Novo (sub-componente) | Grade flexível/responsiva na barra de filtros de `RequestDetailsTab` para acomodar os inputs das chaves ativas. |
| `AgentMetadataSection` | Novo (sub-componente) | Seção estruturada no Drawer de requisições com chave-valor formatado e ação de cópia. |

---

### 2. Matriz de Estados por Tela

#### Tela 1: Requests (`/dashboard/requests` / `RequestDetailsTab.js`)
- **Empty State**:
  - Mensagem: "No request details found".
  - Subtexto: "No requests match the selected filters (Provider, Dates or Agent Metadata). Try adjusting or clearing your filters."
  - Ação: Botão visível "Clear Filters" para reset imediato.
- **Loading State**:
  - Tabela exibe linha centralizada com ícone animado `progress_activity` e texto "Loading request details...".
  - Botão "Refresh" exibe indicador `animate-pulse` com botão desabilitado para evitar requisições concorrentes duplicadas.
- **Error State**:
  - Banner de alerta no topo da tabela: "Failed to load request details. [Retry]".
  - Mantém os valores preenchidos nos filtros para que o usuário não perca seu contexto de pesquisa.
- **Success State**:
  - Tabela com linhas paginadas.
  - Cada linha apresenta coluna Request com badges compactos de metadados (`Badge size="sm" variant="default"` com tooltip de `key: value`).
  - Drawer exibe detalhes completos, incluindo bloco "Agent Metadata" com formatação clara monospace.

#### Tela 2: Settings / Profile (`/dashboard/profile/page.js`)
- **Empty State (Chaves Vazia)**:
  - Se o usuário remover todas as chaves: Exibe aviso sutil: "No metadata keys configured. No metadata attributes will be indexed or aggregated." com botão de destaque "Restore Default Keys".
- **Loading State**:
  - Carregamento inicial da página: Skeleton / spinner padrão do card de configurações.
  - Salvamento de chave (`PATCH`): Campo de input exibe spinner no botão `Add` e tags ficam temporariamente com opacidade reduzida (`opacity-60 pointer-events-none`).
- **Error State**:
  - Validação de entrada (cliente): Mensagem de erro em vermelho abaixo do input (ex.: "Key cannot be empty", "Key 'os' already exists", "Invalid characters. Use only letters, numbers, hyphens and underscores").
  - Falha de rede/API: Banner de erro "Failed to save metadata keys. Please try again."
- **Success State**:
  - Lista de chips atualizada com animação suave de entrada/saída.
  - Mensagem efêmera ou indicador de sucesso "Settings saved".

#### Tela 3: Usage Dashboard (`/dashboard/usage` / `UsageStats.js`)
- **Empty State**:
  - Mensagem: "No usage recorded for this metadata dimension in the selected period."
  - Sugestão: "Try selecting a broader time period (e.g. 7D or 30D) or check if client requests are sending _agent_metadata."
- **Loading State**:
  - Shimmer skeleton nas linhas da tabela de agregação de uso ou spinner sutil ao trocar de período/dimensão.
- **Error State**:
  - Mensagem de erro "Unable to load aggregated usage metrics. [Retry]".
- **Success State**:
  - Tabela agregada por dimensão de metadado (ex.: por Agent Name) exibindo colunas de requisições, prompt tokens, cached tokens, completion tokens e custos, com ordenação interativa por cabeçalho.

---

## Usability Traceability

| Requirement (EARS front) | Usability decision | Covered states | Accessibility | Validation | Basis | Status |
|---|---|---|---|---|---|---|
| **Configuração de Chaves** (`spec:109,118`) | Disponibilizar componente de tags no card de Observabilidade em `/dashboard/profile` para visualizar e gerenciar `agentMetadataKeys`. | empty, loading, error, success | `role="list"`, `aria-label="Indexed metadata keys"`, foco no input pós-adição | Acessar `/dashboard/profile`, inspecionar tags padrão `["os", "hostname", "agent-name"]`. | U4, U5 | defined |
| **Adição e Remoção de Chaves** (`spec:110,118`) | Input com botão `+ Add` e suporte à tecla `Enter`. Botão `✕` em cada tag para remoção com salvamento via `PATCH /api/settings`. Botão "Reset to defaults". | loading, error, success | Botão de remoção com `aria-label="Remove key {key}"` e `tabIndex=0`. Mensagem de erro com `role="alert"`. | Adicionar `mode`, verificar tag adicionada; remover `mode`, verificar remoção. | U4, U5 | defined |
| **Filtros Dinâmicos por Metadados** (`spec:114,116`) | Renderizar inputs de filtro correspondentes às `agentMetadataKeys` ativas na barra de filtros de `RequestDetailsTab`. | empty, loading, error, success | `<label htmlFor="meta-filter-{key}">`, navegação sequencial por `Tab`. | Digitar valor no filtro `agent-name`, verificar requisição à API e atualização da tabela. | U1, U7 | defined |
| **Badges de Metadados na Tabela** (`spec:116`) | Exibir badges compactos de metadados na coluna Request de cada linha, permitindo visualização rápida de agente, SO e host. | success | Tooltip informativo (`title="os: linux"`), contraste legível em tema claro/escuro. | Inspecionar listagem e verificar presença dos badges `[os: linux]`, `[agent: pi]`. | U2 | defined |
| **Seção Agent Metadata no Drawer** (`spec:115,116`) | Adicionar seção estruturada "Agent Metadata" no Drawer de detalhes exibindo todos os pares chave-valor e botão de cópia. | loading, success | Título com `<h3>`, botão de cópia com `aria-label="Copy metadata"`, feedback "Copied!". | Clicar em "Detail", conferir seção "Agent Metadata" e testar botão de cópia. | U3 | defined |
| **Reset Global de Filtros** (`spec:116`) | O botão "Clear Filters" limpa Provider, Datas e todos os campos de metadados, retornando à página 1. | success | Botão desabilitado quando nenhum filtro está ativo (`aria-disabled`). | Aplicar filtro de metadado, clicar em "Clear Filters", validar limpeza completa. | U7 | defined |
| **Métricas Agregadas por Metadados** (`spec:117`) | Adicionar dimensões de metadados no seletor de visualização do `UsageStats` com tabela de métricas e ordenação. | empty, loading, error, success | Cabeçalhos com `<th scope="col">` e `aria-sort`, navegação por teclado. | Selecionar "Usage by Agent Name", verificar agregação de tokens, requisições e custos. | U6 | defined |

---

## Error Prevention & Recovery

### 1. Prevenção de Erros (Error Prevention)
- **Validação de Sintaxe de Chaves**:
  - O campo de nova chave rejeita strings vazias ou compostas apenas por espaços.
  - Sanitização automática: remove espaços extras e converte para minúsculas / kebab-case.
  - Rejeita caracteres proibidos pelo MongoDB (como `$`, `.`, barras ou caracteres de controle).
  - Impede a inclusão de chaves duplicadas já presentes na lista ativa com aviso inline imediato ("Key is already active").
- **Proteção contra Sobrecarga de Requisições de Filtro**:
  - Aplicação de debounce suave nas alterações de texto dos filtros de metadados (ou trigger em `Enter`/Blur) para evitar disparos excessivos de `fetchDetails`.
- **Desabilitação de Ações Concorrentes**:
  - O botão `Add` e os botões de exclusão de tag são desabilitados durante a execução do `PATCH /api/settings`, evitando condições de corrida.
- **Prevenção de Perda de Estado de Filtros em Erro de Rede**:
  - Se a busca de requisições falhar, os inputs de filtro permanecem preenchidos com os valores digitados pelo usuário, permitindo nova tentativa imediata sem necessidade de redigitar.

### 2. Recuperação de Erros (Error Recovery)
- **Restauração Rápida de Configuração Padrão**:
  - Disponibilização do botão "Reset to defaults" na tela de configurações para recuperar a configuração canônica `["os", "hostname", "agent-name"]` em caso de exclusão acidental.
- **Botão Clear Filters em Estado Vazio**:
  - Quando uma combinação de filtros não retorna registros (Empty State), o botão "Clear Filters" é mantido em destaque na tela para facilitar o retorno imediato à visão geral.
- **Mensagens de Erro Acionáveis**:
  - Mensagens de erro de API incluem ação de retry ("Failed to load data. [Retry]"), permitindo recuperação com um único clique.
- **Feedback de Cópia**:
  - O botão de cópia de metadados no Drawer fornece feedback transitório claro ("Copied!") com reversão automática após 2 segundos.

---

## Accessibility

### 1. Navegação por Teclado e Foco
- **Gerenciador de Tags (Profile / Settings)**:
  - O campo de entrada de nova chave suporta submissão direta via tecla `Enter`.
  - Cada botão de exclusão de tag (`✕`) é focável via `Tab` e ativável via `Enter` ou `Space`.
  - Ao excluir uma tag via teclado, o foco é transferido previsivelmente para a tag adjacente ou para o campo de input.
- **Filtros de Requisições (Requests)**:
  - Todos os inputs e selects de filtro possuem atributos `id` associados a `<label htmlFor="...">`.
  - Ordem de tabulação lógica: Provider → Filtros de Metadados → Data Inicial → Data Final → Refresh → Clear Filters.
- **Drawer de Detalhes**:
  - Fechamento com tecla `Esc`.
  - Foco retido dentro do Drawer enquanto aberto e retornado ao botão "Detail" de origem ao fechar.
- **Tabelas de Uso**:
  - Cabeçalhos ordenáveis são focáveis via `Tab` e ativáveis via `Enter`/`Space`.

### 2. Labels, Papéis (Roles) e Leitores de Tela
- Botões com ícones puros (ex.: botão de remover tag, botão de copiar) possuem `aria-label` descritivo explícito (ex.: `aria-label="Remove metadata key hostname"`, `aria-label="Copy agent metadata JSON"`).
- Mensagens de erro e status de salvamento utilizam `role="alert"` ou `aria-live="polite"` para anúncio imediato a tecnologias assistivas.
- As tabelas de requisições e métricas utilizam tags semânticas `<table>`, `<thead>`, `<tbody>`, `<th> scope="col"`, `<td>` e atributos `aria-sort="ascending|descending|none"`.

### 3. Contraste e Temas (Light / Dark)
- Todos os textos de badges, tags e mensagens informativas utilizam as classes de cores semânticas do design system (`text-text-main`, `text-text-muted`, `bg-surface-2`, `border-border`), garantindo conformidade com WCAG AA (mínimo 4.5:1 para texto normal e 3:1 para componentes de UI).
- Estados de foco utilizam anéis visíveis com contraste (`focus:ring-2 focus:ring-primary/40`).

---

## Out of Scope

- Decisões estéticas, escolha de tokens ou estilização de pixels: delegadas ao subagente `frontend-design` na etapa de execução.
- Alteração no protocolo de transporte ou injeção forçada de `_agent_metadata` em clientes externos.
- Criação de novos sistemas de telemetria externos ou painéis dedicados fora do Next.js dashboard existente.
- Alterações em regras de roteamento de modelos ou balanceamento com base em metadados.

---

## Open Questions

- none

---

## Readiness Gates

- [x] `AGENTS.md` (ou diretório de referências) e `spec.md` lidos.
- [x] Todos os requisitos de frontend possuem fluxo, estados e acessibilidade definidos e vinculados a um `U#`.
- [x] Prevenção e recuperação de erros cobertas em todos os fluxos.
- [x] Estados empty/loading/error/success cobertos em todas as telas afetadas.
- [x] Guardian aprovou `ux.md`.

---

## Definition of Done

- [x] Usabilidade de cada requisito de frontend fechada com rastreabilidade completa.
- [x] Estados e acessibilidade definidos com evidências e decisões concretas.
- [x] Validação prática e passos de teste definidos para cada fluxo.
- [x] Guardian aprovou.
