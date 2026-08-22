import fs from "node:fs";
import path from "node:path";
import { ensureDirs, DATA_FILE, DB_DIR, BACKUPS_DIR, LEGACY_FILES } from "./paths.js";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

async function tryBunSqlite() {
  // Bun runtime only — built-in, no install needed
  if (!process.versions.bun) return null;
  try {
    const { createBunSqliteAdapter } = await import("./adapters/bunSqliteAdapter.js");
    return await createBunSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] bun:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function tryBetterSqlite() {
  // Skip on Bun — better-sqlite3 native bindings unsupported
  if (process.versions.bun) return null;
  try {
    const { createBetterSqliteAdapter } = await import("./adapters/betterSqliteAdapter.js");
    return createBetterSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] better-sqlite3 unavailable: ${e.message}`);
    return null;
  }
}

async function tryNodeSqlite() {
  // Built-in since Node 22.5.0 — no install needed. Skip under Bun (no node:sqlite).
  if (process.versions.bun) return null;
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 5)) return null;
  try {
    const { createNodeSqliteAdapter } = await import("./adapters/nodeSqliteAdapter.js");
    return await createNodeSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] node:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function trySqlJs() {
  try {
    const { createSqlJsAdapter } = await import("./adapters/sqljsAdapter.js");
    return await createSqlJsAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] sql.js unavailable: ${e.message}`);
    return null;
  }
}

function hasLegacyData() {
  return Object.values(LEGACY_FILES).some((file) => fs.existsSync(file));
}

function isLikelyCorruptDatabase() {
  const walFile = `${DATA_FILE}-wal`;
  if (!fs.existsSync(DATA_FILE) || fs.existsSync(walFile)) return false;

  try {
    const header = Buffer.alloc(32);
    const fd = fs.openSync(DATA_FILE, "r");
    try { fs.readSync(fd, header, 0, header.length, 0); } finally { fs.closeSync(fd); }
    if (header.toString("ascii", 0, 15) !== "SQLite format 3") return false;

    const pageSize = header.readUInt16BE(16) || 65536;
    const pageCount = header.readUInt32BE(28);
    return pageCount > 0 && pageCount * pageSize !== fs.statSync(DATA_FILE).size;
  } catch {
    return false;
  }
}

function recoverCorruptDatabase() {
  if (!hasLegacyData() || !isLikelyCorruptDatabase()) return false;

  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const backupPath = path.join(BACKUPS_DIR, `corrupt-${stamp}.sqlite`);
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  fs.renameSync(DATA_FILE, backupPath);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${DATA_FILE}${suffix}`;
    if (fs.existsSync(sidecar)) fs.renameSync(sidecar, `${backupPath}${suffix}`);
  }

  const marker = path.join(DB_DIR, ".migrated-from-json");
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
  console.warn(`[DB] Corrupt SQLite archived at ${backupPath}; rebuilding from legacy data`);
  return true;
}

async function initAdapter(recovered = false) {
  ensureDirs();
  // Order per runtime:
  //   Bun:  bun:sqlite → sql.js
  //   Node: better-sqlite3 → node:sqlite (≥22.5) → sql.js
  let adapter = await tryBunSqlite();
  if (!adapter) adapter = await tryBetterSqlite();
  if (!adapter) adapter = await tryNodeSqlite();
  if (!adapter) adapter = await trySqlJs();
  if (!adapter && !recovered && recoverCorruptDatabase()) return initAdapter(true);
  if (!adapter) throw new Error("[DB] No SQLite driver available (bun/better/node/sql.js all failed)");

  if (!state.logged) {
    console.log(`[DB] Driver: ${adapter.driver} | file: ${DATA_FILE}`);
    state.logged = true;
  }

  const { runMigrationOnce } = await import("./migrate.js");
  await runMigrationOnce(adapter);
  return adapter;
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) state.initPromise = initAdapter().then((a) => { state.instance = a; return a; });
  return state.initPromise;
}

export function getAdapterSync() {
  if (!state.instance) throw new Error("[DB] adapter not initialized — await getAdapter() first");
  return state.instance;
}
