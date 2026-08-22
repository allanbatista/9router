import { getAdapter } from "../driver.js";

const TTL_MS = 30 * 60 * 1000;
const CAP = 10000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let cleanupTimer = null;
function ensureCleanup() {
  if (cleanupTimer || typeof setInterval === "undefined") return;
  cleanupTimer = setInterval(() => { pruneExpired().catch(() => {}); }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export async function getComboAffinity(comboName, cacheKeyHash) {
  if (!comboName || !cacheKeyHash) return null;
  try {
    const db = await getAdapter();
    const row = db.get(`SELECT * FROM comboAffinity WHERE comboName = ? AND cacheKeyHash = ?`, [comboName, cacheKeyHash]);
    if (!row) return null;
    if (TTL_MS > 0) {
      const age = Date.now() - new Date(row.updatedAt).getTime();
      if (age > TTL_MS) {
        db.run(`DELETE FROM comboAffinity WHERE comboName = ? AND cacheKeyHash = ?`, [comboName, cacheKeyHash]);
        return null;
      }
    }
    ensureCleanup();
    return row;
  } catch { return null; }
}

export async function setComboAffinity(comboName, cacheKeyHash, rawKey, selectedModel) {
  if (!comboName || !cacheKeyHash || !selectedModel) return;
  try {
    const db = await getAdapter();
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO comboAffinity(comboName, cacheKeyHash, rawKey, selectedModel, updatedAt, hitCount) VALUES(?, ?, ?, ?, ?, 1)
       ON CONFLICT(comboName, cacheKeyHash) DO UPDATE SET rawKey=excluded.rawKey, selectedModel=excluded.selectedModel, updatedAt=excluded.updatedAt, hitCount=hitCount+1`,
      [comboName, cacheKeyHash, rawKey || cacheKeyHash, selectedModel, now]
    );
    ensureCleanup();
    const cnt = db.get(`SELECT COUNT(*) as c FROM comboAffinity`);
    if (cnt && cnt.c > CAP) db.run(`DELETE FROM comboAffinity WHERE rowid IN (SELECT rowid FROM comboAffinity ORDER BY updatedAt ASC LIMIT ?)`, [cnt.c - CAP]);
  } catch (e) { console.error("[comboAffinity] set failed", e.message); }
}

export async function touchComboAffinity(comboName, cacheKeyHash) {
  try {
    const db = await getAdapter();
    db.run(`UPDATE comboAffinity SET updatedAt = ?, hitCount = hitCount + 1 WHERE comboName = ? AND cacheKeyHash = ?`, [new Date().toISOString(), comboName, cacheKeyHash]);
  } catch {}
}

export async function pruneComboExpired() {
  try {
    const db = await getAdapter();
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    db.run(`DELETE FROM comboAffinity WHERE updatedAt < ?`, [cutoff]);
    const cnt = db.get(`SELECT COUNT(*) as c FROM comboAffinity`);
    if (cnt && cnt.c > CAP) db.run(`DELETE FROM comboAffinity WHERE rowid IN (SELECT rowid FROM comboAffinity ORDER BY updatedAt ASC LIMIT ?)`, [cnt.c - CAP]);
  } catch {}
}
