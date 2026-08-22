import { v4 as uuidv4 } from "uuid";
import { getConnection } from "../connection.js";
import { ApiKey } from "../models/ApiKey.js";

function docToKey(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    key: doc.key,
    name: doc.name,
    machineId: doc.machineId,
    isActive: doc.isActive === true || doc.isActive === 1,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
  };
}

export async function getApiKeys() {
  await getConnection();
  const docs = await ApiKey.find({}).sort({ createdAt: 1 }).lean();
  return docs.map(docToKey);
}

export async function getApiKeyById(id) {
  if (!id) return null;
  await getConnection();
  const doc = await ApiKey.findById(id).lean();
  return docToKey(doc);
}

export async function createApiKey(name, machineId) {
  if (!machineId) throw new Error("machineId is required");
  await getConnection();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);

  const apiKeyDoc = {
    _id: uuidv4(),
    name: name || null,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: new Date(),
  };

  await ApiKey.create(apiKeyDoc);
  return docToKey(apiKeyDoc);
}

export async function updateApiKey(id, data = {}) {
  if (!id) return null;
  await getConnection();
  const existingDoc = await ApiKey.findById(id).lean();
  if (!existingDoc) return null;

  const existing = docToKey(existingDoc);
  const merged = { ...existing, ...data };

  await ApiKey.findByIdAndUpdate(
    id,
    {
      $set: {
        key: merged.key,
        name: merged.name,
        machineId: merged.machineId,
        isActive: merged.isActive !== false,
      },
    },
    { new: true }
  ).lean();

  return merged;
}

export async function deleteApiKey(id) {
  if (!id) return false;
  await getConnection();
  const res = await ApiKey.deleteOne({ _id: id });
  return (res.deletedCount || 0) > 0;
}

export async function validateApiKey(key) {
  if (!key) return false;
  await getConnection();
  const doc = await ApiKey.findOne({ key }).lean();
  if (!doc) return false;
  return doc.isActive === true || doc.isActive === 1;
}
