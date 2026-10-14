import { getConnection } from "../connection.js";
import { KvEntry } from "../models/KvEntry.js";

export function makeKv(scope) {
  return {
    async get(key, fallback = null) {
      await getConnection();
      const doc = await KvEntry.findOne({ scope, key }).lean();
      return doc ? (doc.value !== undefined ? doc.value : fallback) : fallback;
    },
    async getAll() {
      await getConnection();
      const docs = await KvEntry.find({ scope }).lean();
      const out = {};
      for (const d of docs) {
        out[d.key] = d.value;
      }
      return out;
    },
    async set(key, value) {
      await getConnection();
      await KvEntry.findOneAndUpdate(
        { scope, key },
        { $set: { value, updatedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    },
    async setMany(obj) {
      if (!obj || typeof obj !== "object") return;
      await getConnection();
      const entries = Object.entries(obj);
      if (entries.length === 0) return;
      const now = new Date();
      const operations = entries.map(([k, v]) => ({
        updateOne: {
          filter: { scope, key: k },
          update: { $set: { value: v, updatedAt: now } },
          upsert: true,
        },
      }));
      await KvEntry.bulkWrite(operations);
    },
    async remove(key) {
      await getConnection();
      await KvEntry.deleteOne({ scope, key });
    },
    async clear() {
      await getConnection();
      await KvEntry.deleteMany({ scope });
    },
  };
}
