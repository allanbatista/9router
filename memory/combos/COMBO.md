# Combo

## Responsabilidade

Representar um grupo nomeado de modelos e suas configurações de execução no 9Router.

## Entidades

- `combos`: coleção MongoDB com `name`, `kind`, `models`, `defaultEffort`, `createdAt` e `updatedAt`.
- `defaultEffort`: campo opcional nullable; `null` ou string vazia não altera a requisição.

## Relações

`ComboFormModal` grava pelo `/api/combos`; `combosRepo` converte documentos Mongo para o contrato da aplicação; `getComboConfig` resolve o documento completo para o roteador de chat; `applyComboDefaultEffort` protege a precedência do effort enviado pelo cliente.

## Fluxo

1. O modal inicializa `defaultEffort` vazio quando o combo não possui configuração.
2. POST e PUT validam os níveis aceitos e convertem vazio para `null`.
3. Exportação, importação e migração SQLite preservam o campo.
4. A execução copia o default para `reasoning_effort` apenas quando `extractThinking` não encontra intenção explícita.

## Fontes no codigo

- `src/shared/constants/combo.js`
- `src/lib/db/models/Combo.js`
- `src/lib/db/repos/combosRepo.js`
- `src/lib/db/index.js`
- `scripts/migrate-sqlite-to-mongo.mjs`
- `src/app/api/combos/route.js`
- `src/app/api/combos/[id]/route.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/CoworkToolCard.js`
- `src/sse/services/model.js`
- `open-sse/services/combo.js`
- `src/sse/handlers/chat.js`
