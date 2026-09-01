# Combos

## Responsabilidade

Agrupar modelos para fallback, round-robin ou fusion e aplicar configurações comuns ao fluxo de execução.

## Entidades

- [Combo](./COMBO.md): documento persistido e contrato de configuração do grupo.

## Relações

```mermaid
flowchart LR
  UI[ComboFormModal] --> API[/api/combos]
  API --> REPO[combosRepo]
  REPO --> MONGO[(MongoDB combos)]
  MONGO --> ROUTE[getComboConfig]
  ROUTE --> EXEC[chat combo execution]
```

## Fluxo

Cada modelo configurado em um combo pode ter seu reasoning effort definido individualmente no modal via combobox, gerando a notação `modelo(effort)`. Durante uma requisição de chat, o modelo em execução aplica sua configuração de reasoning effort diretamente ao provedor correspondente.
## Fontes no codigo

- `src/shared/constants/combo.js`
- `src/shared/components/ComboFormModal.js`
- `src/app/(dashboard)/dashboard/combos/page.js`
- `src/app/(dashboard)/dashboard/cli-tools/components/CoworkToolCard.js`
- `src/app/api/combos/`
- `src/lib/db/models/Combo.js`
- `src/lib/db/repos/combosRepo.js`
- `src/sse/services/model.js`
- `src/sse/handlers/chat.js`
- `open-sse/services/combo.js`
