# Chat Screen with History — UX

Status: ready
Spec: ./spec.md
Created: 2026-08-23 00:00
Updated: 2026-08-23 00:00

## Applicability

- Frontend affected: yes — evidence: `spec.md` Validation surfaces ("frontend/browser, API, backend/persistence"), criação da rota `/dashboard/chat`, redirecionamento de `/dashboard/basic-chat`, inclusão de item na navegação principal `Sidebar.js`, ajuste de layout em `DashboardLayout.js` e implementação dos componentes interativos de UI (`ChatSidebar`, `ChatMessage`, `ChatInput`, `ModelSelector`, `SystemPromptModal`, `BranchNavigator`, `CodeBlock`).

## Usability Ledger

| ID | Source | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| U1 | `src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js:815-847` | O histórico de sessões era exibido em um menu popover suspenso no cabeçalho (`historyOpen`), sem categorização temporal, dificultando encontrar conversas anteriores e gerando fricção cognitiva ao alternar entre múltiplos chats. | `BasicChatPageClient.js` linhas 815-847 (`sessionItems.map` em popover suspenso) | Substituição por uma barra lateral dedicada colapsável estilo ChatGPT com agrupamento cronológico (Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, Anteriores) e drawer responsivo em mobile. | confirmed |
| U2 | `src/shared/components/Sidebar.js:20-40` & `src/shared/components/layouts/DashboardLayout.js:98-99` | Não havia atalho direto para o Chat na navegação principal do 9Router e o container padrão do dashboard adiciona padding externo (`p-6 lg:p-10`) que causa barra de rolagem dupla em telas de chat que exigem ocupação de 100% da viewport. | `navItems` em `Sidebar.js` e `pathname === "/dashboard/basic-chat" ? "" : "p-6 lg:p-10"` em `DashboardLayout.js` | Adição do item "Chat" (ícone `forum`) em `Sidebar.js` e extensão da regra de padding zero / altura total no `DashboardLayout.js` para `/dashboard/chat`. | confirmed |
| U3 | `src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js:884-904` | As mensagens eram renderizadas em texto puro (`whitespace-pre-wrap`), sem suporte a títulos, listas, tabelas Markdown ou realce de blocos de código com botão de cópia, prejudicando a legibilidade de respostas técnicas com código. | `BasicChatPageClient.js:900-903` (`<div className="whitespace-pre-wrap break-words">{content}</div>`) | Integração de parser Markdown com biblioteca `marked`, suporte a tabelas/listas e blocos de código com destaque de sintaxe e botão "Copy code" com confirmação visual. | confirmed |
| U4 | `src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js:638-728` | A interface não permitia interromper o streaming de inferência nem editar turnos anteriores para explorar ramificações alternativas da conversa; o usuário precisava reiniciar todo o chat se errasse o prompt. | `fetch("/api/dashboard/chat/completions")` em `BasicChatPageClient.js` sem controle de branching e sem botão de parada visível no formulário | Introdução de botão "Stop generating" durante o streaming ativo e funcionalidade de edição de turnos do usuário com branching de mensagens e navegação entre variantes (`< 1/N >`). | confirmed |
| U5 | `src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js:745-798` | O seletor de modelos no cabeçalho exibia apenas provedores diretos sem suporte a busca por texto e sem integração com os Combos configurados no 9Router. | `modelMenuOpen` em `BasicChatPageClient.js:760-798` | Criação de dropdown aprimorado de modelos e combos com barra de busca/filtro rápido, separação em seções ("Modelos de Provedores" e "Combos Inteligentes") e visualização clara do provedor/capacidades. | confirmed |
| U6 | `src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js:910-960` | O campo de entrada de texto não possuía suporte nativo a colagem de imagens via clipboard (Ctrl+V) ou drag-and-drop, e a pré-visualização de arquivos anexados era básica. | `handleFileSelect` em `BasicChatPageClient.js` | Implementação de área de input com textarea auto-ajustável, atalhos de envio, colagem direta de imagens via clipboard, drag-and-drop e miniaturas com botão de remoção rápida. | confirmed |
| U7 | `src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js` | Não havia recurso para definir ou editar o System Prompt de uma conversa específica diretamente pela UI do chat. | Inexistência de controles de system prompt em `BasicChatPageClient.js` | Adição de botão e modal de System Prompt no cabeçalho da conversa, permitindo instruir o assistente com persistência na sessão e badge indicador de status ativo. | confirmed |

## Affected Screens & Flows

### Affected Screens and Routes
1. **`/dashboard/chat` (Página Principal de Chat)**: Tela dividida em barra lateral colapsável de histórico e área principal de conversação (cabeçalho com seletores, fluxo de mensagens e caixa de entrada inferior).
2. **`/dashboard/basic-chat` (Rota Legada)**: Redirecionamento 307/308 automático para `/dashboard/chat` garantindo compatibilidade com bookmarks e links antigos.
3. **Barra Lateral do Dashboard (`Sidebar.js`)**: Inclusão do link de navegação "Chat" com ícone `forum` e indicador de rota ativa.
4. **Modal de Confirmação de Exclusão (`DeleteSessionModal`)**: Diálogo acessível para confirmar a exclusão permanente de uma conversa.
5. **Modal de System Prompt (`SystemPromptModal`)**: Diálogo para visualizar e editar as instruções de sistema da sessão atual.

### Target Task Flows

#### Fluxo 1: Iniciar uma Nova Conversa
1. O usuário clica no item "Chat" na barra lateral de navegação ou no botão "+ Novo Chat" (`+ New Chat`) no topo da barra lateral de histórico.
2. O sistema cria uma nova sessão vazia no MongoDB (`POST /api/chat/sessions`), seleciona o modelo/combo padrão ou herdado da última preferência e foca imediatamente a caixa de texto de entrada.
3. A área central de conversa exibe a tela de boas-vindas (*Empty State*) com sugestões de início rápido e seletor de modelos acessível.

#### Fluxo 2: Envio de Mensagem e Streaming em Tempo Real
1. O usuário digita a mensagem no textarea inferior (pode anexar imagens via botão de anexo, drag-and-drop ou Ctrl+V).
2. O usuário pressiona `Enter` (ou clica no botão Enviar com ícone de seta/avião).
3. A mensagem do usuário é imediatamente adicionada ao fluxo de conversa alinhada à direita com miniaturas de anexos (se houver).
4. O botão de Enviar transforma-se no botão "Stop generating" (ícone de quadrado / parada).
5. O assistente inicia a resposta com um indicador de digitação pulsante e renderiza o conteúdo token a token via SSE.
6. A rolagem da tela acompanha automaticamente o final da conversa; se o usuário rolar para cima manualmente durante o streaming, a rolagem automática é desativada temporariamente para leitura sem solavancos.
7. O usuário pode clicar em "Stop generating" a qualquer momento para abortar a requisição mantendo o texto parcial recebido.
8. Ao término do streaming, o botão volta ao estado normal de envio e o Markdown é completamente renderizado com realce nos blocos de código e botão de cópia.

#### Fluxo 3: Navegação e Gestão de Histórico
1. O usuário visualiza a barra lateral esquerda com sessões agrupadas em seções cronológicas: "Hoje", "Ontem", "Últimos 7 dias", "Últimos 30 dias" e "Anteriores".
2. Ao passar o mouse (ou focar via teclado) em uma sessão:
   - Clicar na sessão carrega imediatamente as mensagens do MongoDB e atualiza a área de chat.
   - Clicar no ícone de lápis / editar ativa a renomeação inline do título (com botões de salvar `✓` e cancelar `✕`, ou confirmação por `Enter` e cancelamento por `Esc`).
   - Clicar no ícone de lixeira abre o modal de confirmação de exclusão.
3. Se a sessão excluída for a ativa, o sistema automaticamente seleciona a sessão mais recente disponível ou cria uma nova sessão vazia.
4. Em dispositivos móveis ou telas pequenas (< 1024px), a barra lateral funciona como um drawer overlay que pode ser aberto pelo botão de histórico/menu no cabeçalho e fechado por toque fora ou botão de fechar.

#### Fluxo 4: Edição de Turnos Anteriores e Navegação em Branching
1. O usuário passa o mouse sobre uma mensagem anterior enviada por ele e clica no botão "Editar" (ícone de lápis).
2. O balão da mensagem abre um editor inline com o texto original preenchido e botões "Salvar e Reenviar" e "Cancelar".
3. Ao salvar, o sistema gera uma nova ramificação na árvore de mensagens (`parentId`), envia a nova solicitação de completude e gera uma nova resposta do assistente.
4. O balão da mensagem passa a exibir os controles de paginação de variantes (`< 1/2 >`), permitindo que o usuário alterne livremente entre as diferentes versões da conversa a qualquer momento.

#### Fluxo 5: Customização de System Prompt
1. No cabeçalho da conversa, o usuário clica no botão "System Prompt" (ícone `tune` ou `psychology`).
2. Um modal abre exibindo o campo de texto para instruções personalizadas com explicações sobre o impacto no comportamento do modelo.
3. O usuário edita o prompt e clica em "Salvar".
4. O modal fecha, a sessão é atualizada no MongoDB e um indicador visual sutil (badge ativo) no cabeçalho informa que a sessão possui instruções personalizadas.

## Component & State Inventory

### Components
- **`Sidebar.js` (Reutilizado & Atualizado)**: Adição do item "Chat" (`href: "/dashboard/chat"`, `icon: "forum"`).
- **`DashboardLayout.js` (Reutilizado & Atualizado)**: Tratamento de layout com altura total e padding zero para `/dashboard/chat`.
- **`ChatPageClient.js` (Novo / Atualizado)**: Container principal da tela de chat gerenciando estado da sessão, streaming, foco e atalhos.
- **`ChatSidebar.js` (Novo)**: Barra lateral com botão Novo Chat, busca de histórico, grupos cronológicos, itens de sessão com ações de renomear e excluir, e controle de colapso.
- **`ChatHeader.js` (Novo)**: Cabeçalho com botão toggle da sidebar, seletor de modelos/combos, botão de System Prompt e botão de novo chat rápido.
- **`ModelSelectorDropdown.js` (Novo)**: Dropdown com busca por texto, agrupamento por provedores conectados e Combos ativos, badges informativos e navegação por teclado.
- **`ChatMessageList.js` (Novo)**: Área de rolagem com detecção de scroll manual, botão flutuante "Rolar para o final" quando desacoplado e renderização dos nós da árvore ativa.
- **`ChatMessageItem.js` (Novo)**: Balão de mensagem (usuário ou assistente) com avatar, timestamp relativo, miniaturas de anexos, botões de ação (Copiar, Editar, Reenviar) e navegador de branches (`BranchNavigator`).
- **`MarkdownRenderer.js` (Novo)**: Renderizador seguro baseado em `marked` com suporte a GitHub Flavored Markdown (tabelas, listas, links seguros) e blocos de código customizados (`CodeBlock`).
- **`CodeBlock.js` (Novo)**: Bloco de código com cabeçalho contendo o nome da linguagem, botão "Copiar código" com feedback visual de 2 segundos ("Copiado!") e formatação tipográfica monoespaçada legível.
- **`ChatInputArea.js` (Novo)**: Caixa de texto expansível com auto-resize, suporte a anexos de imagem (picker, drop e paste), carrossel de previews com remoção e botão dinâmico Enviar/Parar.
- **`SystemPromptModal.js` (Novo)**: Modal acessível com foco gerenciado para configuração das instruções de sistema da conversa.
- **`DeleteSessionConfirmModal.js` (Novo)**: Modal de confirmação para exclusão de sessões.

### Estados por Tela e Componente

| Superfície / Componente | Empty State | Loading State | Error State | Success State |
|---|---|---|---|---|
| **Barra Lateral de Histórico (`ChatSidebar`)** | Nenhuma conversa salva: exibe mensagem amigável ("Nenhuma conversa ainda") e botão destacado "+ Novo Chat". | Carregamento inicial de sessões: exibe 4-5 linhas de skeletons pulsantes simulando títulos de conversas. | Falha ao buscar `/api/chat/sessions`: exibe alerta discreto com botão "Tentar novamente" sem bloquear uso local. | Lista de sessões agrupadas cronologicamente ("Hoje", "Ontem", "Últimos 7 dias", etc.) com a sessão ativa destacada. |
| **Área Central de Mensagens (`ChatMessageList`)** | Conversa vazia recém-criada: exibe ilustração/ícone de chat, título de boas-vindas e orientações sobre seleção de modelos. | Mensagens sendo carregadas ou streaming SSE ativo com indicador de digitação pulsante e texto atualizando token a token. | Falha de inferência / erro de rede: exibe balão de erro com borda/fundo vermelho sutil, mensagem explicativa e botão "Reenviar / Tentar novamente". | Conversa completa com mensagens formatadas em Markdown, blocos de código com botão de cópia e galeria de anexos. |
| **Seletor de Modelos (`ModelSelectorDropdown`)** | Nenhum provedor conectado: exibe mensagem com link rápido para conectar provedores em `/dashboard/providers`. | Carregando lista de modelos/combos: spinner sutil dentro do dropdown com indicador de carregamento. | Falha ao buscar modelos: exibe aviso de indisponibilidade com opção de recarregar. | Lista categorizada de modelos por provedor e combos ativos, com filtro de busca em tempo real e marcação de seleção. |
| **Caixa de Entrada (`ChatInputArea`)** | Campo vazio: textarea com placeholder convidativo ("Envie uma mensagem ou cole imagens..."), botão de envio desabilitado. | Durante streaming: botão de envio substitui-se por botão "Parar geração" com destaque visual e atalho `Esc`. | Arquivo inválido ou imagem acima do tamanho permitido: exibe toast/alerta imediato impedindo o anexo. | Texto digitado e imagens anexadas com miniaturas visíveis e botão de envio ativado. |
| **Modal de System Prompt (`SystemPromptModal`)** | Textarea em branco com placeholder explicativo ("Defina instruções personalizadas para o comportamento do assistente nesta conversa..."). | Botão "Salvar" exibindo spinner de carregamento enquanto persiste no backend. | Alerta em caso de falha de conexão ao salvar no MongoDB. | Prompt salvo, modal fecha e badge "System Prompt Ativo" passa a ser exibido no cabeçalho da conversa. |
| **Modal de Exclusão (`DeleteSessionConfirmModal`)** | N/A | Botão "Excluir" em estado de loading/desabilitado durante requisição `DELETE`. | Mensagem de erro caso a exclusão falhe no servidor. | Sessão excluída, modal fechado e lista de histórico atualizada instantaneamente. |

## Usability Traceability

| Requirement (EARS front) | Usability decision | Covered states | Accessibility | Validation | Basis | Status |
|---|---|---|---|---|---|---|
| Acesso pelo Menu Principal | Item "Chat" com ícone `forum` inserido na navegação da `Sidebar.js`; ao clicar, navega para `/dashboard/chat` com altura 100% da viewport e sem rolagem dupla no `DashboardLayout.js`. | empty, loading, success | `role="link"`, `aria-current="page"` quando ativo, foco visível. | Clicar em "Chat" na sidebar lateral e verificar URL `/dashboard/chat` ocupando toda a tela. | D2, D3, [C1], U2 | defined |
| Redirecionamento de Rota Legada | Rota `/dashboard/basic-chat` executa redirecionamento automático para `/dashboard/chat` sem quebrar fluxo do usuário. | loading, success | Redirecionamento transparente sem interrupção de leitores de tela. | Acessar `/dashboard/basic-chat` e conferir redirecionamento para `/dashboard/chat`. | D1, [C1], U2 | defined |
| Layout ChatGPT com Sidebar Cronológica | Barra lateral colapsável à esquerda com botão "+ Novo Chat", busca rápida e grupos temporais (Hoje, Ontem, Últimos 7 dias, etc.). Em mobile, abre como drawer deslizante com backdrop. | empty, loading, error, success | `aria-label="Histórico de conversas"`, `aria-expanded` no botão de colapso, navegação por setas/Tab. | Abrir tela de chat, verificar agrupamento cronológico, colapsar sidebar e abrir em viewport mobile (<768px). | D1, [C4], U1 | defined |
| Criação e Gestão de Sessões no MongoDB | Botão "+ Novo Chat" cria sessão no servidor, limpa o painel de mensagens, seleciona o modelo padrão e move o foco para o textarea. | empty, loading, error, success | `aria-label="Criar nova conversa"`, atalho de teclado `Ctrl+Shift+O` / `Cmd+Shift+O`, foco automático no input. | Clicar em "+ Novo Chat", verificar criação na lista e foco imediato no textarea de mensagens. | D4, [C2], U1 | defined |
| Renomeação e Exclusão de Sessões | Ações contextuais em cada item da sidebar: renomeação inline (`Enter` salva, `Esc` cancela) e exclusão com diálogo de confirmação claro. | loading, error, success | Foco retornado ao item após fechar modal; `role="dialog"`, `aria-labelledby`, botões com labels descritivos. | Renomear título inline via teclado e excluir conversa confirmando no modal. | D4, [C2], [C4], U1 | defined |
| Streaming SSE via Dashboard Endpoint | Resposta transmitida em tempo real via SSE token a token com indicador pulsante `▋`. Autoscroll inteligente que não interrompe rolagem manual do usuário para cima. | loading, error, success | `aria-live="polite"` na área de resposta, botão "Rolar para o final" quando usuário rola para cima. | Enviar prompt longo e verificar streaming contínuo sem travamento e comportamento do scroll. | D5, [C3], U4 | defined |
| Renderização Markdown e Blocos de Código | Parser `marked` seguro renderizando tabelas, listas e blocos de código com destaque visual e botão "Copiar código" com feedback de sucesso ("Copiado!"). | success | Botão de cópia com `aria-label="Copiar código para a área de transferência"`, feedback anunciado para leitores de tela. | Enviar mensagem solicitando código Python/JS e testar renderização do bloco e clique no botão de cópia. | D7, [C4], U3 | defined |
| Interrupção de Geração (Stop) | Botão "Stop generating" visível durante streaming ativo; clique ou atalho `Esc` aborta requisição e preserva o texto parcial gerado até o momento. | loading, success | `aria-label="Parar geração da resposta"`, acionável via teclado com `Esc` ou clique. | Iniciar resposta longa, clicar em "Stop generating" e verificar preservação do conteúdo parcial na sessão. | D1, [C4], U4 | defined |
| Seletor de Modelos e Combos | Dropdown no cabeçalho com campo de busca, agrupando modelos por provedor conectado e Combos inteligentes cadastrados, exibindo badges de capacidade. | empty, loading, error, success | `role="combobox"`, `aria-haspopup="listbox"`, atalho `Ctrl+K` para abrir busca de modelos, suporte a setas e `Enter`. | Clicar no seletor, digitar nome de um combo/modelo no filtro de busca e selecionar com teclado. | D6, [C5], U5 | defined |
| Anexo de Imagens (Visão) | Suporte a upload via botão de arquivo, drag-and-drop na área do chat e colagem direta via clipboard (Ctrl+V); exibição de miniatura com botão de remoção rápida. | empty, error, success | `aria-label="Remover anexo"`, preview com texto alternativo descritivo, validação de tipos de imagem suportados. | Colar imagem com `Ctrl+V`, verificar thumbnail no formulário, enviar e checar miniatura no balão do usuário. | D1, [C4], U6 | defined |
| Edição de Turnos e Branching | Botão "Editar" em mensagens do usuário abre editor inline; reenvio gera novo nó filho na árvore de mensagens com paginação de versões (`< 1/N >`). | loading, error, success | `aria-label="Mensagem versão X de Y"`, botões de navegação acessíveis por teclado, foco no editor ao acionar. | Editar mensagem intermediária da conversa, reenviar e alternar entre versões 1 e 2 pelos controles `<` e `>`. | [C4], U4 | defined |
| System Prompt Customizado por Conversa | Botão "System Prompt" no cabeçalho abre modal com editor de instruções; ao salvar, persiste na sessão e exibe badge indicador ativo. | empty, loading, error, success | `aria-label="Configurar prompt de sistema"`, foco preso no modal (*focus trap*), fechamento por `Esc`. | Abrir modal de System Prompt, definir "Responda sempre em português formal", salvar e validar resposta. | [C4], U7 | defined |
| Persistência Completa de Histórico | Ao recarregar a página ou selecionar conversa anterior, restaura histórico completo, mensagens, ramificações e configurações do MongoDB. | empty, loading, error, success | Estado de carregamento suave com skeletons, restauração instantânea do ramo ativo. | Recarregar navegador na rota `/dashboard/chat` e validar integridade do histórico e sessão ativa. | D4, [C2], U1 | defined |

## Error Prevention & Recovery

### Prevenção de Erros (Error Prevention)
- **Bloqueio de Envio Vazio**: O botão de envio permanece desabilitado e o atalho `Enter` não dispara requisição quando o campo de texto estiver vazio e sem imagens anexadas.
- **Validação de Anexos**: Validação imediata de tipo MIME (apenas `image/jpeg`, `image/png`, `image/webp`, `image/gif`) e tamanho máximo (limite de 10MB por imagem) no momento da seleção/colagem, exibindo aviso claro antes de tentar o envio.
- **Confirmação Destrutiva**: Exclusão de conversas exige confirmação explícita em modal com foco padrão no botão "Cancelar" para evitar cliques acidentais.
- **Prevenção de Perda de Rascunho**: Em caso de cancelamento da edição de um turno anterior, o sistema restaura o conteúdo original sem alterar a árvore de mensagens.
- **Bloqueio de Múltiplos Envios Simultâneos**: O formulário desabilita novo envio enquanto uma inferência estiver em progresso, alternando o controle de ação para o botão "Stop".
- **Fechamento Seguro de Modais**: Modais podem ser fechados clicando no backdrop ou pressionando `Esc`, sem aplicar alterações não salvas.

### Recuperação de Erros (Error Recovery)
- **Persistência de Rascunho em Caso de Falha**: Se a requisição de inferência falhar por instabilidade de rede ou erro no provedor, o texto digitado pelo usuário não é perdido, permanecendo disponível para reenvio imediato.
- **Botão de Tentar Novamente (Retry)**: Balões de mensagem com erro de streaming exibem botão destacado "Tentar novamente" que reexecuta a inferência a partir daquele ponto.
- **Preservação de Conteúdo Parcial em Abort**: Caso o usuário clique em "Stop generating" ou ocorra perda de conexão no meio da resposta, todos os tokens recebidos até o momento da interrupção são salvos e consolidados na sessão no MongoDB.
- **Recuperação de Falha de Conexão na Sidebar**: Se a listagem de sessões falhar ao carregar, a sidebar exibe botão "Tentar reconectar" sem travar a interface de chat local.

## Accessibility (A11y)

### Diretrizes e Critérios Concretos por Superfície

1. **Navegação por Teclado e Foco**:
   - `Tab` e `Shift+Tab`: Navegação sequencial lógica e previsível por todos os elementos interativos (links da sidebar, botões de ação, itens de histórico, seletor de modelos, campo de texto e botões de mensagem).
   - `Enter` no textarea: Envia a mensagem (quando habilitado).
   - `Shift+Enter` no textarea: Insere nova linha sem enviar.
   - `Esc`: Fecha dropdowns abertos (seletor de modelos), modais ativos (System Prompt, Confirmação de Exclusão) ou cancela a edição inline de turnos/títulos.
   - `Ctrl+Shift+O` / `Cmd+Shift+O`: Atalho global para criar Novo Chat instantaneamente.
   - `Ctrl+K` / `Cmd+K`: Atalho global para abrir o seletor de modelos com foco no campo de busca.

2. **Gerenciamento de Foco e Focus Trap**:
   - Ao abrir qualquer modal (`DeleteSessionConfirmModal`, `SystemPromptModal`), o foco é transferido para o primeiro elemento acionável dentro do modal e mantido em loop fechado (*focus trap*).
   - Ao fechar o modal, o foco retorna exatamente ao botão que disparou a abertura.
   - Ao clicar em "+ Novo Chat", o foco é automaticamente transferido para o campo de texto de mensagem.
   - Todos os elementos interativos possuem anel de foco evidente (`focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none`).

3. **Leitores de Tela e Semântica ARIA**:
   - A área de histórico na sidebar utiliza `role="navigation"` e `aria-label="Histórico de conversas"`.
   - A lista de mensagens utiliza `role="log"` com `aria-live="polite"` para que novos blocos de texto recebidos sejam anunciados sem interromper a fala do leitor.
   - Botões com ícones isolados possuem atributos `aria-label` descritivos e precisos (ex: `aria-label="Copiar código para a área de transferência"`, `aria-label="Editar mensagem enviada"`, `aria-label="Excluir conversa"`).
   - O seletor de modelos implementa padrão combobox/listbox acessível com `aria-expanded`, `aria-haspopup="listbox"` e `aria-activedescendant`.
   - Controles de paginação de branches possuem `aria-label="Versão anterior da mensagem"` e `aria-label="Próxima versão da mensagem"`.

4. **Contraste de Cores e Tipografia**:
   - Todas as combinações de texto sobre fundo atendem à razão mínima de contraste de 4.5:1 para texto normal e 3:1 para texto grande/elementos de interface (conforme WCAG 2.1 nível AA).
   - O indicador de streaming e os botões de ação possuem contraste adequado tanto em tema escuro quanto claro.

## Out of Scope

- **Aesthetics/Tokens/Pixels**: Definição detalhada de paleta de cores finas, sombras específicas, tokens CSS, animações avançadas de transição ou raio de bordas milimétricas — delegado à fase de execução / design visual (`frontend-design`).
- **Comunicação por Áudio e Voz em Tempo Real**: Microfone, Speech-to-Text em tempo real no chat ou reprodução de voz via Text-to-Speech (TTS).
- **Exportação de Conversas para PDF/DOCX**: Geração de arquivos exportados de histórico para formatos externos além do uso na própria interface.
- **Suporte a Plugins Externos / Tool Calling na UI do Dashboard**: Execução de plugins gráficos de terceiros diretamente na interface de chat nesta versão.

## Open Questions

- none

## Readiness Gates

- [x] `AGENTS.md` and `spec.md` read.
- [x] Every frontend requirement has flow, states and a11y defined and linked to a `U#`.
- [x] Error prevention and recovery covered.
- [x] empty/loading/error/success states covered per affected screen.
- [x] Guardian approved `ux.md`.

## Definition of Done

- [x] Usability of every frontend requirement closed with traceability.
- [x] States and accessibility defined with evidence or decision.
- [x] Practical validation (browser/steps) defined for each flow.
- [x] Guardian approved.
