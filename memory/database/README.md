# Banco de dados

## Responsabilidade

Documentar a inicialização SQLite e a recuperação segura de dados persistidos.

## Entidades

- [SQLite](./SQLITE.md): seleção de driver, migrações e recuperação de arquivo corrompido.

## Relações

```mermaid
flowchart LR
  DRIVER[driver.js] --> ADAPTERS[adapters]
  DRIVER --> MIGRATE[migrate.js]
  MIGRATE --> LEGACY[dataDir JSON]
```

## Fluxo

O processo tenta `better-sqlite3`, `node:sqlite` e `sql.js` no runtime Node. Se o arquivo SQLite estiver estruturalmente inconsistente e houver dados legados, o arquivo é preservado em `db/backups/` e a migração JSON é refeita.

## Fontes no codigo

- `src/lib/db/driver.js`
- `src/lib/db/paths.js`
- `src/lib/db/migrate.js`
- `src/lib/db/adapters/`
