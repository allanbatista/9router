import { getConnection } from "../connection.js";
import { Meta } from "../models/Meta.js";

export async function getMeta(key, fallback = null) {
  await getConnection();
  const doc = await Meta.findOne({ key }).lean();
  return doc && doc.value !== undefined ? doc.value : fallback;
}

export async function setMeta(key, value) {
  await getConnection();
  await Meta.findOneAndUpdate(
    { key },
    { $set: { value, updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// Sync fallback stubs kept for retrocompatibility
export function getMetaSync(adapter, key, fallback = null) {
  if (adapter && typeof adapter.get === "function") {
    const row = adapter.get(`SELECT value FROM _meta WHERE key = ?`, [key]);
    return row ? row.value : fallback;
  }
  return fallback;
}

export function setMetaSync(adapter, key, value) {
  if (adapter && typeof adapter.run === "function") {
    adapter.run(
      `INSERT INTO _meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, String(value)]
    );
  }
}
