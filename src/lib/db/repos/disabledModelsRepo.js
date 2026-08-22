import { getConnection } from "../connection.js";
import { KvEntry } from "../models/KvEntry.js";

const SCOPE = "disabledModels";

export async function getDisabledModels() {
  await getConnection();
  const docs = await KvEntry.find({ scope: SCOPE }).lean();
  const out = {};
  for (const d of docs) {
    out[d.key] = Array.isArray(d.value) ? d.value : [];
  }
  return out;
}

export async function getDisabledByProvider(providerAlias) {
  if (!providerAlias) return [];
  await getConnection();
  const doc = await KvEntry.findOne({ scope: SCOPE, key: providerAlias }).lean();
  return Array.isArray(doc?.value) ? doc.value : [];
}

// Atomic update with union of disabled model IDs
export async function disableModels(providerAlias, ids) {
  if (!providerAlias || !Array.isArray(ids) || ids.length === 0) return;
  await getConnection();

  const doc = await KvEntry.findOne({ scope: SCOPE, key: providerAlias }).lean();
  const current = Array.isArray(doc?.value) ? doc.value : [];
  const merged = [...new Set([...current, ...ids])];

  await KvEntry.findOneAndUpdate(
    { scope: SCOPE, key: providerAlias },
    { $set: { value: merged, updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// Atomic remove of IDs or clear if empty
export async function enableModels(providerAlias, ids) {
  if (!providerAlias) return;
  await getConnection();

  if (!Array.isArray(ids) || ids.length === 0) {
    await KvEntry.deleteOne({ scope: SCOPE, key: providerAlias });
    return;
  }

  const doc = await KvEntry.findOne({ scope: SCOPE, key: providerAlias }).lean();
  const current = Array.isArray(doc?.value) ? doc.value : [];
  const removeSet = new Set(ids);
  const next = current.filter((id) => !removeSet.has(id));

  if (next.length === 0) {
    await KvEntry.deleteOne({ scope: SCOPE, key: providerAlias });
  } else {
    await KvEntry.findOneAndUpdate(
      { scope: SCOPE, key: providerAlias },
      { $set: { value: next, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}
