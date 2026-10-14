# SQLite

## Responsabilidade

Selecionar um driver SQLite disponível e manter a inicialização resiliente no Docker.

## Entidades

- `DATA_FILE`: `DATA_DIR/db/data.sqlite`.
- Drivers: `better-sqlite3`, `node:sqlite` e `sql.js`.
- Dados legados: arquivos definidos em `LEGACY_FILES`.

## Relações

`driver.js` cria um adapter, executa `migrate.js` e persiste o banco em `DATA_FILE`.

## Fluxo

Quando o SQLite persistido declara menos páginas que o tamanho físico e não há WAL, o arquivo é considerado corrompido. Se houver JSON legado, ele é movido para `db/backups/corrupt-*.sqlite`, o marcador de migração é removido e o banco é reconstruído sem apagar a evidência original.

## Fontes no codigo

- `src/lib/db/driver.js`
- `src/lib/db/paths.js`
- `src/lib/db/migrate.js`
- `src/lib/db/adapters/betterSqliteAdapter.js`
- `src/lib/db/adapters/nodeSqliteAdapter.js`
- `src/lib/db/adapters/sqljsAdapter.js`
