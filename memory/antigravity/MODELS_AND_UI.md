# Catálogo e dashboard

## Responsabilidade

Manter os modelos Antigravity disponíveis no runtime, CLI, MITM e dashboard, incluindo capacidades e cotas exibidas.

## Entidades

- `antigravity.models`: catálogo canônico e IDs enviados ao upstream.
- `resolveCaps`: resolve capacidades por `provider/model` sem depender da resposta dinâmica.

## Relações

O catálogo alimenta a lista da página do provider. CLI e MITM repetem os aliases aceitos; o serviço de uso filtra as cotas exibidas pelos mesmos IDs.

## Fluxo

A página solicita modelos e capacidades. Quando a API não possui metadados, `resolveCaps` separa provider e modelo e aplica as capacidades estáticas. Modelos Gemini 3.8 Flash usam aliases `high`, `medium` e `low`, mapeados para `gemini-3.8-flash-tiered(<level>)`.

## Fontes no código

- `open-sse/providers/registry/antigravity.js`
- `open-sse/services/usage/google.js`
- `src/shared/hooks/useModelCaps.js`
- `src/shared/utils/modelCaps.js`
- `src/mitm/config.js`
- `cli/src/cli/menus/providers.js`
