# PWA

## Responsabilidade

Fornecer metadados e ícones compatíveis com a instalação do 9Router como aplicativo no Chromium/ChromeOS.

## Entidades

- `manifest()`: contrato do manifesto web.
- `icon-192.png`: ícone rasterizado de 192x192.
- `icon-512.png`: ícone rasterizado de 512x512, também usado como maskable.

## Relações

`manifest()` referencia os arquivos estáticos em `public/icons/`; o navegador escolhe esses PNGs durante a instalação.

## Fluxo

O Next.js publica o manifesto em `/manifest.webmanifest` e os PNGs em `/icons/*.png`. O manifesto prioriza PNG para compatibilidade de instalação no Chromium e mantém o mesmo desenho dos SVGs-fonte.

## Fontes no código

- `src/app/manifest.js`
- `public/icons/icon-192.svg`
- `public/icons/icon-512.svg`
- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `tests/unit/pwa-manifest.test.js`
