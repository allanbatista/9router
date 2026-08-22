import crypto from "node:crypto";
import { getAdapter } from "../driver.js";

const TTL_MS = 30 * 60 * 1000;
const CAP = 10000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function sha16(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex").slice(0, 16);
}

export function hashCacheKey(normalized) {
  if (!normalized || typeof normalized !== "string") return null;
  const v = normalized.trim();
  if (!v) return null;
  return sha16(v);
}

export function normalizeCacheKey(raw, provider) {
  if (!raw || typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > 256) return null;
  if (provider === "antigravity" || provider === "gemini-cli") {
    if (/^-?\d+$/.test(v)) return v;
    const h = crypto.createHash("sha256").update(v).digest();
    const n = h.readBigUInt64BE(0) & 0x7fffffffffffffffn;
    return `-${n.toString()}`;
  }
  return v;
}

export function consistentIndex(hash, n) {
  if (!hash || n <= 0) return 0;
  const buf = Buffer.from(hash.slice(0, 8), "hex");
  let num = 0;
  for (let i = 0; i < buf.length; i++) num = (num * 31 + buf[i]) % n;
  return num;
}

let cleanupTimer = null;
function ensureCleanup() {
  if (cleanupTimer || typeof setInterval === "undefined") return;
  cleanupTimer = setInterval(() => {
    pruneExpired().catch(() => {});
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export async function getAffinity(provider, model, cacheKeyHash) {
  if (!provider || !model || !cacheKeyHash) return null;
  try {
    const db = await getAdapter();
    const row = db.get(`SELECT * FROM sessionAffinity WHERE provider = ? AND model = ? AND cacheKeyHash = ?`, [provider, model, cacheKeyHash]);
    if (!row) return null;
    if (TTL_MS > 0) {
      const age = Date.now() - new Date(row.updatedAt).getTime();
      if (age > TTL_MS) {
        db.run(`DELETE FROM sessionAffinity WHERE provider = ? AND model = ? AND cacheKeyHash = ?`, [provider, model, cacheKeyHash]);
        return null;
      }
    }
    ensureCleanup();
    return row;
  } catch { return null; }
}

export async function setAffinity(provider, model, cacheKeyHash, rawKey, connectionId) {
  if (!provider || !model || !cacheKeyHash || !connectionId) return;
  try {
    const db = await getAdapter();
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessionAffinity(provider, model, cacheKeyHash, rawKey, connectionId, updatedAt, hitCount) VALUES(?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(provider, model, cacheKeyHash) DO UPDATE SET rawKey=excluded.rawKey, connectionId=excluded.connectionId, updatedAt=excluded.updatedAt, hitCount=hitCount+1`,
      [provider, model, cacheKeyHash, rawKey || cacheKeyHash, connectionId, now]
    );
    ensureCleanup();
    const cnt = db.get(`SELECT COUNT(*) as c FROM sessionAffinity`);
    if (cnt && cnt.c > CAP) {
      db.run(`DELETE FROM sessionAffinity WHERE rowid IN (SELECT rowid FROM sessionAffinity ORDER BY updatedAt ASC LIMIT ?)`, [cnt.c - CAP]);
    }
  } catch (e) { console.error("[sessionAffinity] set failed", e.message); }
}

export async function touchAffinity(provider, model, cacheKeyHash) {
  try {
    const db = await getAdapter();
    db.run(`UPDATE sessionAffinity SET updatedAt = ?, hitCount = hitCount + 1 WHERE provider = ? AND model = ? AND cacheKeyHash = ?`,
      [new Date().toISOString(), provider, model, cacheKeyHash]);
  } catch {}
}

export async function pruneExpired() {
  try {
    const db = await getAdapter();
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    db.run(`DELETE FROM sessionAffinity WHERE updatedAt < ?`, [cutoff]);
    const cnt = db.get(`SELECT COUNT(*) as c FROM sessionAffinity`);
    if (cnt && cnt.c > CAP) {
      db.run(`DELETE FROM sessionAffinity WHERE rowid IN (SELECT rowid FROM sessionAffinity ORDER BY updatedAt ASC LIMIT ?)`, [cnt.c - CAP]);
    }
  } catch {}
}
