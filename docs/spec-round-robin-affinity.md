# Spec: Round Robin With Affinity — plataforma / provider / combo (model-aware, 30m TTL)

## Context
- Gateway `9router` roteia `POST /v1/chat|messages|responses` via `src/sse/handlers/chat.js → src/sse/services/auth.js:getProviderCredentials` (conta) e `open-sse/services/combo.js:handleComboChat / getRotatedModels` (modelo dentro do combo).
- Estratégias atuais: `fill-first` (default `priority[0]` sticky) e `round-robin` (LRU `lastUsedAt/consecutiveUseCount`). Nenhuma lê `prompt_cache_key / x-session-id / sessionId` (`open-sse/utils/sessionManager.js:extractClientSessionId / toNumericSessionId`).
- Prompt cache: `Antigravity/Gemini sessionId → "-<int64>" (sha256→int64, toNumericSessionId)` e `Codex prompt_cache_key` são por `(account, sessionId, prefix>1k)` e por `(account, model, prefix)`. Evidência: `sid -5044208976631007399 (= sha256("omp-01a0263e-5ce3-7000-bd65-d9ccef9e00e9"))` em 4 contas `e5e9/2b38/19f5/08f4` — mesmo prefixo espalhado. `Combo myCombo=[antigravity/gemini-flash, claude/opus, codex/gpt5]` com o mesmo `omp-*` ainda sorteia modelo por `fallback/round-robin`, logo troca de modelo também invalida prefixo.
- Correção proposta: esta spec garante que **account é destino, não nível de config**. Níveis de config são 3: **plataforma (global)**, **provider (por provider)**, **combo (por combo)**, com herança e chave sempre `model`-aware.

## Goals
- Novo `fallbackStrategy = "round-robin-affinity"` opt-in em 3 níveis, sem quebrar `fill-first` / `round-robin`.
- Affinity persistida em SQLite (sobrevive restart), TTL 30m deslizante, cap 10k.
- Chave inclui `model` — `Combo` preserva sessão por modelo (`gemini-flash-high ≠ claude-opus` mesmo `omp-*`).
- Repetível para `antigravity/gemini-cli` (`toNumeric`), `codex/claude` (`raw`), `kiro` exceto `ephemeral`.

## Non-Goals
- Não mudar `fill-first`/`round-robin` existentes.
- Não criar cache de resposta; só roteamento.
- Não pinar `kiro` `scope==kiro && !clientSid → randomUUID ephemeral=true`.

## Níveis de configuração (herança)
Efektif strategy é resolvido por contexto:
```
if (isComboRequest) effective = comboStrategies[comboName]?.fallbackStrategy ?? settings.fallbackStrategy  // plataforma default
else                effective = providerStrategies[provider]?.fallbackStrategy ?? settings.fallbackStrategy
```
- **Plataforma** `settings.fallbackStrategy` (`src/app/(dashboard)/dashboard/profile/page.js`): hoje `fill-first` global queima `priority[0]`. Com `round-robin-affinity` global, qualquer provider/combo sem override herda. Risco: provider de 1 conta não precisa, mas sem custo — LRU fallback quando sem chave.
- **Provider** `providerStrategies[provider].fallbackStrategy` (`ConnectionsCard.js` + `providers/[id]/page.js`): override fino. Ex: `antigravity=affinity`, `ollama=fill-first`. Chave `provider:model:hash` garante `provider/model` separadas.
- **Combo** `comboStrategies[comboName].fallbackStrategy` (`combos/page.js`): override para seleção de **modelo dentro do combo**. Chave `combo:comboName:hash` garante `comboA:hash → gemini-flash` estável, repina só se `modelLock/rateLimited`. Sem isso, `round-robin` de combo quebra mesmo que provider affinity acerte conta.

Account não é configurável — é o valor escolhido (`sessionAffinity.connectionId` / `comboAffinity.selectedModel`).

## Design — Key derivation (comum)
```
raw = extractClientSessionId({headers: rawHeaders, body, scope})
      || assistantText hash (≥50 chars) || workspaceId
      // inputs: body.request.sessionId / prompt_cache_key / session_id /
      //         conversation_id / x-session-id/* / x-client-request-id /
      //         metadata.user_id._session_
normalized =
  if provider in {antigravity, gemini-cli}: toNumericSessionId(raw) // "-504..."
  else raw.trim(cap 256)
cacheKeyHash = sha16(normalized) // sha256 hex[0:16]
lookupKey provider affinity: (provider, model, cacheKeyHash)  stored rawKey for display
lookupKey combo affinity:    (comboName, cacheKeyHash)        stored selectedModel
```
- Extração antes do loop: `chat.js:handleChat` via `resolveSessionIdentity({headers, body, scope})`. Se `raw==null` ou `ident.ephemeral` (kiro sem chave), sem affinity → LRU normal.
- Model é o concreto após `getModelInfo` / `getComboModels` — não o nome do combo.

## Storage
`src/lib/db/schema.js SCHEMA_VERSION 2 → 3`.

`sessionAffinity` (provider affinity, já existente):
```sql
provider TEXT NOT NULL, model TEXT NOT NULL, cacheKeyHash TEXT NOT NULL,
rawKey TEXT NOT NULL, connectionId TEXT NOT NULL,
updatedAt TEXT NOT NULL, hitCount INTEGER DEFAULT 1,
PRIMARY KEY (provider, model, cacheKeyHash)
INDEX idx_sa_updatedAt, idx_sa_conn
```

`comboAffinity` (nova, combo affinity):
```sql
comboName TEXT NOT NULL, cacheKeyHash TEXT NOT NULL,
rawKey TEXT NOT NULL, selectedModel TEXT NOT NULL,
updatedAt TEXT NOT NULL, hitCount INTEGER DEFAULT 1,
PRIMARY KEY (comboName, cacheKeyHash)
INDEX idx_ca_updatedAt
```
- Repos: `sessionAffinityRepo.js: getAffinity/setAffinity/touchAffinity/consistentIndex/normalizeCacheKey/hashCacheKey` + `comboAffinityRepo.js: getComboAffinity/setComboAffinity/touchComboAffinity` — ambos `pruneExpired TTL=30*60*1000 cap=10k`.
- Cleanup `setInterval 5m` + check on read `now-updatedAt>TTL` delete.
- Migrations `002-session-affinity.js` (já aplicada) + `003-combo-affinity.js`.
- Herda backup via `SCHEMA_VERSION`.

## Selection

### Provider affinity (`src/sse/services/auth.js:getProviderCredentials(provider, exclude, model, {cacheKeyHash, rawKey})`)
Nova branch `strategy==="round-robin-affinity"`:
1. `aff=getAffinity(provider, model, hash)` se hash.
2. Se `aff && !exclude.has(aff.connectionId) && available.has(aff.connectionId) && !isModelLockActive(affConn, model)` → `touchAffinity` + return.
3. Senão `idx=consistentIndex(hash, available.length)` → candidate; se locked/excluded usa LRU restante. `setAffinity(provider, model, hash, rawKey, chosen.id)` + `updateProviderConnection(lastUsedAt)`.
4. Sem hash → LRU como `round-robin`.
5. `preferredConnectionId` ainda vence.

### Combo affinity (`open-sse/services/combo.js:getRotatedModels / handleComboChat`)
Nova estratégia `round-robin-affinity`:
1. Se `strategy !== "round-robin-affinity"` → mantém `fallback/round-robin/fusion` existentes.
2. Se `strategy==="round-robin-affinity"` e `hash` (derivado como acima com `scope=comboName || "combo"`):
   - `aff=getComboAffinity(comboName, hash)`; se `aff && models.includes(aff.selectedModel) && !isModelLockedForCombo(aff.selectedModel)` → ordena `models` rotacionado a partir de `aff.selectedModel`, `touchComboAffinity`, retorna.
   - Senão `model=consistentIndex(hash, models.length)` → `setComboAffinity(comboName, hash, rawKey, model)` e rotaciona `models` a partir daí. Se escolhido locked na tentativa (`handleComboChat` detecta `shouldFallback`), próximo `handleComboChat` repina e mantém novo (não ping-pong).
   - Sem hash → fallback LRU idêntico a `round-robin`.

### Integração (`src/sse/handlers/chat.js`)
- Antes do `while(true)` e antes de `getModelInfo`/`getComboModels`: `affinity = deriveAffinityParams(providerHint, modelStr, body, request, clientRawRequest)` via `resolveSessionIdentity`.
- Para combo: `comboHash` derivado com `scope=comboName` (ou `modelStr`); para single: `provider:hash`.
- `handleSingleModelChat` recebe e passa `{cacheKeyHash, rawKey}` ao `getProviderCredentials`; `handleComboChat` recebe `comboAffinity` via `getRotatedModels` com hash.

### Fallback
Affinity account `modelLock_${model}` (429/quota/capacity `errorConfig:ERROR_RULES`) → próxima request repina (`excludeSet` contém old) e persiste novo mapping; lock expirado mantém novo (evita ping-pong). Mesmo para combo.

### RequestDetails
`open-sse/handlers/chatCore/requestDetail.js:OPTIONAL_PARAMS += prompt_cache_key, session_id, conversation_id` + `GET /api/usage/request-details extractIds → cacheKey/sessionId/conversationId` (sem vazar `providerRequest`). Tabela exibe `ck/sid/cid` pequeno abaixo de tokens.

### API/UI (3 níveis)
- Plataforma: `profile/page.js` — toggle `Fill First | Round Robin | Affinity (30m, model-aware)` para `settings.fallbackStrategy`.
- Provider: `providers/[id]/page.js` + `providers/components/ConnectionsCard.js` — `select Fill First / Round Robin / Affinity` para `providerStrategies[provider].fallbackStrategy`.
- Combo: `combos/page.js` — `STRATEGY_OPTIONS += {value:"round-robin-affinity", label:"Affinity — sticky per session (30m, model-aware)"}` + `ComboCard Select` com 4 opções; salvo em `comboStrategies[combo].fallbackStrategy`. Filtro `strategy===round-robin` vs `affinity` para `stickyLimit` UI (affinity não precisa sticky).
- `GET /api/settings` PATCH já aceita qualquer `fallbackStrategy` (sem validação) — suficiente.

### Observability
- `log.info("AUTH affinity hit/miss provider/model 8hex→conn8")` + `log.info("COMBO affinity hit/miss combo 8hex→model")`.
- `/dashboard/usage?tab=details` tokens `sky input - amber cached = semibold diff / violet output` + `ck/sid` abaixo.

### TTL/cap
Sliding `updatedAt=now()` on hit, `TTL 30m`, `cap 10k LRU oldest`.

## Alternatives considered
- Só plataforma: não permite `antigravity affinity, ollama fill-first`.
- Só provider: combo `round-robin` ainda quebra modelo, bloqueia `Combo` mesmo com account afinado.
- Só combo: requests direto `antigravity/gemini-flash` sem combo não ganham.
