import crypto from "node:crypto";
import { getConnection } from "../connection.js";
import { SessionAffinity } from "../models/SessionAffinity.js";

const TTL_MS = 30 * 60 * 1000;
const CAP = 10000;

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

export async function getAffinity(provider, model, cacheKeyHash) {
  if (!provider || !model || !cacheKeyHash) return null;
  try {
    await getConnection();
    const doc = await SessionAffinity.findOne({ provider, model, cacheKeyHash }).lean();
    if (!doc) return null;
    if (TTL_MS > 0 && doc.updatedAt) {
      const age = Date.now() - new Date(doc.updatedAt).getTime();
      if (age > TTL_MS) {
        await SessionAffinity.deleteOne({ provider, model, cacheKeyHash });
        return null;
      }
    }
    return doc;
  } catch {
    return null;
  }
}

export async function setAffinity(provider, model, cacheKeyHash, rawKey, connectionId) {
  if (!provider || !model || !cacheKeyHash || !connectionId) return;
  try {
    await getConnection();
    const now = new Date();
    await SessionAffinity.findOneAndUpdate(
      { provider, model, cacheKeyHash },
      {
        $set: {
          rawKey: rawKey || cacheKeyHash,
          connectionId,
          updatedAt: now,
        },
        $inc: { hitCount: 1 },
        $setOnInsert: {
          provider,
          model,
          cacheKeyHash,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    console.error("[sessionAffinity] set failed", e.message);
  }
}

export async function touchAffinity(provider, model, cacheKeyHash) {
  try {
    await getConnection();
    await SessionAffinity.updateOne(
      { provider, model, cacheKeyHash },
      {
        $set: { updatedAt: new Date() },
        $inc: { hitCount: 1 },
      }
    );
  } catch {}
}

export async function pruneExpired() {
  try {
    await getConnection();
    const cutoff = new Date(Date.now() - TTL_MS);
    await SessionAffinity.deleteMany({ updatedAt: { $lt: cutoff } });
    const cnt = await SessionAffinity.countDocuments();
    if (cnt > CAP) {
      const excess = cnt - CAP;
      const oldest = await SessionAffinity.find({})
        .sort({ updatedAt: 1 })
        .limit(excess)
        .select("_id")
        .lean();
      if (oldest.length > 0) {
        const ids = oldest.map((d) => d._id);
        await SessionAffinity.deleteMany({ _id: { $in: ids } });
      }
    }
  } catch {}
}
