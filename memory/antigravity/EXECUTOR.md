# Antigravity executor

## Responsabilidade

Construir o payload final do endpoint Cloud Code do Antigravity e enviá-lo pelo `BaseExecutor`.

## Entidades

- `AntigravityExecutor`: executor específico para URL, headers e transformação do payload.
- `request.contents`: sequência Gemini de mensagens com `role` e `parts`.
- `parts`: partes de texto, pensamento, `functionCall` e `functionResponse`.
- `firstChunkTimeoutMs`: prazo de 60 segundos para o primeiro chunk do Antigravity.
- `stallTimeoutMs`: prazo de 90 segundos sem novos bytes antes de abortar o stream.
- `timeoutMs`: prazo de 30 segundos para conexão, com uma repetição em erro 502.

## Relações

`openaiToAntigravityRequest` produz o envelope; `AntigravityExecutor.transformRequest()` remove partes de pensamento, preserva chamadas de ferramenta e elimina `contents` sem partes; `BaseExecutor.execute()` serializa e envia o payload ao Google Cloud Code.

## Fluxo

1. Receber o envelope Gemini traduzido.
2. Remover partes somente de pensamento e completar `thoughtSignature` de chamadas de ferramenta.
3. Remover qualquer item `contents` que ficou com `parts` vazio.
4. Sanitizar schemas, limitar tokens e enviar ao upstream.
5. Encerrar streams sem primeiro chunk ou paralisados antes do watchdog do cliente e notificar o fallback.

Um item `model` com `parts: []` gera `400 INVALID_ARGUMENT` no upstream Google.

## Fontes no código

- `open-sse/executors/antigravity.js`
- `open-sse/executors/base.js`
- `open-sse/config/runtimeConfig.js`
- `open-sse/providers/registry/antigravity.js`
- `open-sse/utils/streamHandler.js`
- `open-sse/translator/request/openai-to-gemini.js`
- `tests/translator/bugs-antigravity.test.js`
