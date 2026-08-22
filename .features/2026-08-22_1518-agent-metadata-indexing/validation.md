# Indexação Configurável de _agent_metadata no MongoDB com Filtros e Métricas — Plano e Progresso de Validação

Status: ready
Spec: ./spec.md
Plan: ./plan.md
Updated: 2026-08-22 16:03
Guardian: approved

> `Validation Plan` formulado **antes** de qualquer validação; `Validation Progress` item a item.
> Nenhuma validação foi executada até a data/hora acima; todos os itens estão `pending`.

## Validation Plan

Itens `V#` derivados do Impact Map e das tasks do `plan.md`, cobrindo **todas** as alterações da feature. Cada item vincula requisito/acceptance criterion da spec (R#), método/comandos concretos, evidência esperada (saída observável + exit code) e a fase/task que produz a evidência.

### V1 — Metadata Keys Settings Storage, Fallback & API Validation
- **Descrição:** Valida a inclusão de `agentMetadataKeys` em `DEFAULT_SETTINGS` com os valores padrão `["os", "hostname", "agent-name"]`, o schema Mongoose `Setting` (`[String]`), e os endpoints `GET /api/settings` e `PATCH /api/settings` garantindo validação de sintaxe das chaves (`/^[a-zA-Z0-9_-]+$/`), rejeição de formatos inválidos (HTTP 400), e persistência atômica no documento `global`.
- **Requisito/AC:** R1 (Configuração de Chaves: Given the system starts with default settings, When settings are fetched, Then `agentMetadataKeys` contains `["os", "hostname", "agent-name"]`), R2 (Atualização de Configuração: Given an authenticated request to `PATCH /api/settings` with `agentMetadataKeys: ["os", "hostname", "agent-name", "mode"]`, When the request is processed, Then the settings are updated and returned with the new list)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-settings.test.js`
- **Evidência esperada:** Testes unitários de settings passando com status PASS (exit code 0), confirmando a recuperação do default `["os", "hostname", "agent-name"]`, atualização via PATCH e rejeição de chaves inválidas ou malformadas.
- **Fase/task produtora:** Phase 1 / Task 1.1

### V2 — Ingestion, Normalization & Sanitization Pipeline of `_agent_metadata`
- **Descrição:** Valida o utilitário `open-sse/utils/agentMetadata.js` (`normalizeAgentMetadata`) e a integração em `open-sse/handlers/chatCore/requestDetail.js` e `open-sse/handlers/chatCore.js`, suportando payloads em array `[{ key, value }]` e objetos chave-valor planos, saneando contra injeção de operadores MongoDB (remoção/rejeição de prefixos `$` e caracteres `.`), limitando valores a primitivos escalares seguros com truncamento (máx 256 caracteres), e garantindo fallback para `{}` em requisições sem metadados.
- **Requisito/AC:** R3 (Extração e Normalização: Given an incoming request body containing `_agent_metadata` array with `os`, `hostname` and `agent-name`, When `buildRequestDetail` and `saveRequestUsage` process the request, Then `agentMetadata` contains `{ os: "linux", hostname: "allanbatista-workstation", "agent-name": "pi" }`)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/agent-metadata.test.js`
- **Evidência esperada:** Suíte de testes unitários cobrindo casos normais, payloads com caracteres perigosos (`$`, `.`), arrays malformados, tipos não escalares e ausência de `_agent_metadata` com status PASS (exit code 0).
- **Fase/task produtora:** Phase 1 / Task 1.2

### V3 — RequestDetail Schema, Compound/Wildcard Indexes & Filtered Queries
- **Descrição:** Valida o schema Mongoose `RequestDetail`, a persistência do campo `agentMetadata` na raiz do documento via `flushToDatabase` (bulk write em lote), a definição dos índices compostos padrão (`{ "agentMetadata.agent-name": 1, timestamp: -1 }`, `{ "agentMetadata.os": 1, timestamp: -1 }`, `{ "agentMetadata.hostname": 1, timestamp: -1 }`), o índice wildcard (`{ "agentMetadata.$**": 1 }`), e a execução de consultas filtradas por metadados dinâmicos em `requestDetailsRepo.getRequestDetails`.
- **Requisito/AC:** R4 (Persistência e Indexação em RequestDetail: Given a request detail with `agentMetadata`, When saved via `saveRequestDetail`, Then the document in collection `requestDetails` contains `agentMetadata` and query on `agentMetadata.<key>` uses the index), R6 (Filtro de Requisições por Metadados: Given multiple request details stored with different `agent-name` values, When `GET /api/usage/request-details?agentMetadata.agent-name=pi` is requested, Then only records with `agent-name: "pi"` are returned)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-request-details.test.js`
- **Evidência esperada:** Testes unitários do repositório `requestDetailsRepo` e schema `RequestDetail` passando com status PASS (exit code 0), validando persistência de `agentMetadata`, correta definição de índices e filtragem por `agentMetadata.<key>` com paginação.
- **Fase/task produtora:** Phase 2 / Task 2.1

### V4 — Atomic Metrics Aggregation in UsageDaily & History Storage
- **Descrição:** Valida o schema `UsageDaily` com o campo `byAgentMetadata`, a persistência de `agentMetadata` em `UsageHistory`, os incrementos atômicos via `$inc` em `usageRepo.saveRequestUsage` para cada dimensão e valor presente (contadores de requests, promptTokens, completionTokens, cachedTokens, cost e tracking de `lastUsed`), o saneamento de pontos (`.`) nas chaves de subdocumentos para evitar nesting indesejado no MongoDB, e a consolidação de métricas por dimensão em `usageRepo.getUsageStats`.
- **Requisito/AC:** R5 (Agregação de Métricas em UsageDaily: Given a processed request with `tokens` and `agentMetadata` containing `agent-name: "pi"`, When `saveRequestUsage` executes, Then `UsageDaily` increments requests, tokens and cost under `byAgentMetadata.agent-name.pi`)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-usage.test.js`
- **Evidência esperada:** Testes unitários de `usageRepo` validando operações atômicas `$inc` sob concorrência e retorno consolidado de `byAgentMetadata` no `getUsageStats` com status PASS (exit code 0).
- **Fase/task produtora:** Phase 2 / Task 2.2

### V5 — Request Details API Query Parsing & Transparent Metadata Redaction
- **Descrição:** Valida a rota `GET /api/usage/request-details`, confirmando o parseamento de query parameters nos formatos `agentMetadata.<key>=<value>` e `agentMetadata[<key>]=<value>`, a propagação para `requestDetailsRepo.getRequestDetails`, e o comportamento de sanitização/redação que mascara conversas e payloads brutos (`request`, `response`, `providerRequest`, `providerResponse`) enquanto preserva o objeto estruturado `agentMetadata` transparente e acessível para o frontend.
- **Requisito/AC:** R6 (Filtro de Requisições por Metadados), R7 (Exposição Transparente sem Redação Excessiva: Given a stored request detail with `agentMetadata` and message payloads, When details list is retrieved, Then conversation text is redacted but `agentMetadata` is preserved intact)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/api-request-details.test.js`
- **Evidência esperada:** Testes unitários da rota `/api/usage/request-details` passando com status PASS (exit code 0), validando retorno de metadados intactos com conversas devidamente redigidas e filtros aplicados corretamente.
- **Fase/task produtora:** Phase 3 / Task 3.1

### V6 — Distinct Metadata Values API Route
- **Descrição:** Valida a criação e funcionamento da rota `GET /api/usage/metadata-values`, verificando a obrigatoriedade do parâmetro `key`, o retorno de HTTP 400 para chamadas sem o parâmetro ou com chaves inválidas, e o retorno de HTTP 200 com array ordenado de strings `{ key, values }` baseado em `RequestDetail.distinct("agentMetadata.<key>")`.
- **Requisito/AC:** R6 (Filtro de Requisições por Metadados / Contrato de Autopreenchimento de Filtros)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/api-metadata-values.test.js`
- **Evidência esperada:** Testes da rota passando com status PASS (exit code 0), confirmando resolução de valores distintos e respostas adequadas de validação de erro.
- **Fase/task produtora:** Phase 3 / Task 3.2

### V7 — Settings Profile Metadata Keys Management UI
- **Descrição:** Valida a interface de usuário do card Observability em `src/app/(dashboard)/dashboard/profile/page.js`, confirmando a renderização da seção "Indexed Metadata Keys", exibição de tag chips para as chaves ativas, botão de remoção (`✕`) com `aria-label`, campo de adição com suporte a `Enter` e botão `+ Add`, validação sintática prévia contra caracteres inválidos e duplicatas, botão "Reset to defaults" restaurando `["os", "hostname", "agent-name"]`, e estados visuais de loading/erro/sucesso ao disparar `PATCH /api/settings`.
- **Requisito/AC:** R2 (Atualização de Configuração), R10 (Gestão de Metadados nas Configurações: Given the settings profile page, When the user adds a new key `mode` to `agentMetadataKeys`, Then the setting is saved and becomes active for indexing and filtering)
- **Método/comandos:**
  - `npm run build`
  - `npm --prefix tests test -- unit/request-details-tab.test.js`
- **Evidência esperada:** Build Next.js sem erros de compilação ou linting (exit code 0) e testes de componentes front-end com status PASS (exit code 0).
- **Fase/task produtora:** Phase 4 / Task 4.1

### V8 — Requests Tab Dynamic Filters, Table Badges & Detail Drawer UI
- **Descrição:** Valida o componente `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js`, confirmando o carregamento dinâmico das chaves ativas (`agentMetadataKeys`), a renderização de inputs de filtro para cada chave, a exibição de badges de metadados (`os`, `agent-name`, `hostname`) na listagem de requisições, a seção dedicada "Agent Metadata" no Drawer de detalhes com exibição chave-valor e botão de cópia de JSON com feedback efêmero ("Copied!"), e a limpeza integral de filtros no botão "Clear Filters" (resetando para a página 1).
- **Requisito/AC:** R6 (Filtro de Requisições por Metadados), R7 (Exposição Transparente sem Redação Excessiva), R8 (Visualização e Filtro no Dashboard de Requisições: Given active metadata keys `["os", "hostname", "agent-name"]`, When the user opens the Requests page, Then filter controls for metadata keys are available and table rows display the metadata attributes)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/request-details-tab.test.js`
  - `npm run build`
- **Evidência esperada:** Testes unitários do componente `RequestDetailsTab` passando com status PASS (exit code 0) e compilação do Next.js sem erros (exit code 0).
- **Fase/task produtora:** Phase 4 / Task 4.2

### V9 — UsageStats Grouped Breakdown & Dimensions Table UI
- **Descrição:** Valida o componente `src/shared/components/UsageStats.js`, confirmando a expansão do seletor de visualizações de tabela com as opções de metadados de agentes ("Usage by Agent", "Usage by OS", "Usage by Hostname"), a correta tabulação e ordenação das métricas (requests, prompt tokens, cached tokens, completion tokens, custo e última utilização), e a renderização do estado vazio informativo quando não houver consumo registrado no período.
- **Requisito/AC:** R9 (Dashboard de Métricas por Metadados: Given aggregated usage data in `byAgentMetadata`, When the user views the Usage dashboard by Agent dimension, Then requests, prompt tokens, completion tokens, cached tokens and cost are tabulated by metadata value)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/usage-tokens.test.js`
  - `npm run build`
- **Evidência esperada:** Testes unitários de agregação de tokens e métricas passando com status PASS (exit code 0) e build de produção Next.js íntegro (exit code 0).
- **Fase/task produtora:** Phase 4 / Task 4.3

### V10 — Full End-to-End Integration, Indexing & Regression Gate
- **Descrição:** Valida o fluxo completo de ponta a ponta: configuração de chaves via API/UI -> recepção de requisição de chat com payload `_agent_metadata` -> normalização e armazenamento em `RequestDetail` com índices MongoDB -> agregação atômica em `UsageDaily.byAgentMetadata` -> consulta filtrada por metadados na API e UI -> verificação de regressão executando toda a suíte de testes de banco e rotas do 9Router.
- **Requisito/AC:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10 (Cobertura integral dos critérios de aceitação da spec)
- **Método/comandos:**
  - `npm --prefix tests test -- unit/db-*.test.js unit/agent-metadata.test.js unit/api-*.test.js`
  - `npm run build`
- **Evidência esperada:** Todas as suítes de teste de banco, metadados e APIs executadas com 100% de aprovação (exit code 0) e compilação do Next.js sem avisos ou falhas de tipo (exit code 0).
- **Fase/task produtora:** Phase 5 / Task 5.1

## Validation Progress

Um registro por item `V#`. O **manager de execução** (`batista-execute`) atualiza `Status`/`Evidência produzida` a partir de relatórios do worker e veredictos do `workflow-validator`; o **`workflow-validator`** confere cada item (status + evidência) com aprovação positiva explícita antes de qualquer `pass`.

| Item | Status | Evidência produzida | Conferido pelo workflow-validator |
|---|---|---|---|
| V1 — Metadata Keys Settings Storage, Fallback & API Validation | pass | `agentMetadataKeys` integrado a `DEFAULT_SETTINGS` e `SettingSchema`, testado em `tests/unit/db-settings.test.js` | conferido |
| V2 — Ingestion Normalization, Sanitization & Request Detail Binding | pass | `normalizeAgentMetadata` implementado e integrado em `open-sse/utils/agentMetadata.js`, testado em `tests/unit/agent-metadata.test.js` | conferido |
| V3 — RequestDetail Model Indexes & Dynamic Metadata Query Filtering | pass | Índices compostos e wildcard implementados em `RequestDetail.js` e filtros dinâmicos testados em `tests/unit/db-request-details.test.js` | conferido |
| V4 — Usage Daily Metrics Aggregation by Agent Metadata & Rollup | pass | `byAgentMetadata` integrado a `UsageDaily` e `usageRepo.js` com `$inc` atômico, testado em `tests/unit/db-usage.test.js` | conferido |
| V5 — Request Details API Query Parsing & Unredacted Metadata Retention | pass | Filtros de metadados aceitos em `/api/usage/request-details` sem redação indevida, testado em `tests/unit/api-request-details-metadata.test.js` | conferido |
| V6 — Distinct Metadata Values Endpoint for Autocompletion | pass | Endpoint `/api/usage/metadata-values` implementado com validação e testado em `tests/unit/api-request-details-metadata.test.js` | conferido |
| V7 — Profile / Settings Metadata Keys Management UI | pass | Gerenciador de tags com adicionar, remover e reset to defaults implementado em `src/app/(dashboard)/dashboard/profile/page.js` | conferido |
| V8 — Requests Observability Filters & Metadata Badges UI | pass | Filtros dinâmicos, badges na tabela e exibição detalhada no Drawer implementados em `src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js` | conferido |
| V9 — Usage Stats Agent Dimensions Visualization UI | pass | Seletor de dimensões de agentes e tabelas ordenáveis implementados em `src/shared/components/UsageStats.js` | conferido |
| V10 — Full End-to-End Persistence, Pipeline & Next.js Build Regression Suite | pass | Suíte E2E em `tests/unit/agent-metadata-e2e.test.js` e build de produção `npm run build` executados com sucesso (exit code 0) | conferido |
- **Bloqueio:** itens `pending`/`fail` bloqueiam `converged` (Root Completion Gate do loop) e merge; item `fail` dispara correção via worker e revalidação.
- **Cascata (C2/D6):** mudança substantiva em `spec.md` ou `plan.md` rebaixa este documento para `draft` e o guardian para `pending`, e **todos** os itens `pass` anteriores voltam a `pending` (evidência antiga deixa de contar; aprovação vale só para a revisão lida) até revalidação.
- **Atualização:** a cada mudança de status/evidência, atualiza `Updated:` no cabeçalho e reflete no `Validation Progress`.
- **Limite de escrita:** este arquivo é editado somente pelo manager de execução/loop (allowlist); nunca entra em write set de workers paralelos (arquivo único compartilhado).
