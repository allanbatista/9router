# Combo

## Responsabilidade

Representar um grupo nomeado de modelos e suas configurações de execução no 9Router.

## Entidades

- `combos`: coleção MongoDB com `name`, `kind`, `models`, `createdAt` e `updatedAt`.
- `models`: array de modelos do combo, onde cada item pode opcionalmente definir reasoning effort via sufixo `provider/model(effort)`.

## Relações

`ComboFormModal` grava pelo `/api/combos`; `combosRepo` converte documentos Mongo para o contrato da aplicação; `getComboConfig` resolve o documento completo para o roteador de chat; cada modelo no combo aplica seu effort durante a execução.

## Fluxo

1. No modal do combo, cada modelo adicionado possui um combobox para selecionar o reasoning effort desejado.
2. O effort é serializado junto ao identificador do modelo (ex.: `openai/gpt-4o(high)`).
3. Durante a execução, o 9Router processa o sufixo individualmente ao despachar cada tentativa para o respectivo provedor.
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
