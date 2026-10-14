import { getConnection } from "../connection.js";
import { ComboAffinity } from "../models/ComboAffinity.js";

const TTL_MS = 30 * 60 * 1000;
const CAP = 10000;

export async function getComboAffinity(comboName, cacheKeyHash) {
  if (!comboName || !cacheKeyHash) return null;
  try {
    await getConnection();
    const doc = await ComboAffinity.findOne({ comboName, cacheKeyHash }).lean();
    if (!doc) return null;
    if (TTL_MS > 0 && doc.updatedAt) {
      const age = Date.now() - new Date(doc.updatedAt).getTime();
      if (age > TTL_MS) {
        await ComboAffinity.deleteOne({ comboName, cacheKeyHash });
        return null;
      }
    }
    return doc;
  } catch {
    return null;
  }
}

export async function setComboAffinity(comboName, cacheKeyHash, rawKey, selectedModel) {
  if (!comboName || !cacheKeyHash || !selectedModel) return;
  try {
    await getConnection();
    const now = new Date();
    await ComboAffinity.findOneAndUpdate(
      { comboName, cacheKeyHash },
      {
        $set: {
          rawKey: rawKey || cacheKeyHash,
          selectedModel,
          updatedAt: now,
        },
        $inc: { hitCount: 1 },
        $setOnInsert: {
          comboName,
          cacheKeyHash,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    console.error("[comboAffinity] set failed", e.message);
  }
}

export async function touchComboAffinity(comboName, cacheKeyHash) {
  try {
    await getConnection();
    await ComboAffinity.updateOne(
      { comboName, cacheKeyHash },
      {
        $set: { updatedAt: new Date() },
        $inc: { hitCount: 1 },
      }
    );
  } catch {}
}

export async function pruneComboExpired() {
  try {
    await getConnection();
    const cutoff = new Date(Date.now() - TTL_MS);
    await ComboAffinity.deleteMany({ updatedAt: { $lt: cutoff } });
    const cnt = await ComboAffinity.countDocuments();
    if (cnt > CAP) {
      const excess = cnt - CAP;
      const oldest = await ComboAffinity.find({})
        .sort({ updatedAt: 1 })
        .limit(excess)
        .select("_id")
        .lean();
      if (oldest.length > 0) {
        const ids = oldest.map((d) => d._id);
        await ComboAffinity.deleteMany({ _id: { $in: ids } });
      }
    }
  } catch {}
}
