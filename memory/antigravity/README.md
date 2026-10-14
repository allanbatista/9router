# Antigravity

## Responsabilidade

Registrar, exibir e enviar modelos Gemini Cloud Code para o upstream Antigravity, preservando chamadas de ferramenta e removendo partes de pensamento que não podem ser reenviadas.

## Entidades

- [Antigravity executor](./EXECUTOR.md): transformação final, autenticação e envio da requisição.
- [Catálogo e dashboard](./MODELS_AND_UI.md): modelos expostos e resolução de capacidades na UI.

## Relações

```mermaid
flowchart LR
  TRANSLATOR[openaiToAntigravityRequest] --> EXECUTOR[AntigravityExecutor]
  EXECUTOR --> UPSTREAM[Google Cloud Code]
  WATCHDOG[streamHandler] --> EXECUTOR
  EXECUTOR --> FALLBACK[Account and combo fallback]
  REGISTRY[Antigravity registry] --> DASHBOARD[Provider dashboard]
  REGISTRY --> EXECUTOR
  TESTS[bugs-antigravity.test.js] --> EXECUTOR
```

## Fluxo

O tradutor cria `request.contents` com partes de texto, pensamento e chamadas de ferramenta. O executor remove partes de pensamento, adiciona `thoughtSignature` ausente em chamadas de ferramenta e descarta blocos que ficaram sem partes antes do envio. O transporte aplica prazos próprios de conexão, primeiro chunk e stall; timeout notifica o cooldown da conta e o failover do combo.

## Fontes no código

- `open-sse/translator/request/openai-to-gemini.js`
- `open-sse/executors/antigravity.js`
- `open-sse/config/runtimeConfig.js`
- `open-sse/utils/streamHandler.js`
- `src/sse/handlers/chat.js`
- `tests/translator/bugs-antigravity.test.js`
