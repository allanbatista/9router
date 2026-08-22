import { v4 as uuidv4 } from "uuid";
import { getConnection } from "../connection.js";
import { ProxyPool } from "../models/ProxyPool.js";

function docToPool(doc) {
  if (!doc) return null;
  const extra = doc.data && typeof doc.data === "object" ? doc.data : {};
  return {
    ...extra,
    id: doc._id,
    name: doc.name,
    proxyUrl: doc.proxyUrl,
    isActive: doc.isActive === true || doc.isActive === 1,
    testStatus: doc.testStatus,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : (doc.updatedAt || new Date().toISOString()),
  };
}

export async function getProxyPools(filter = {}) {
  await getConnection();
  const query = {};
  if (filter.isActive !== undefined) {
    query.isActive = Boolean(filter.isActive);
  }
  if (filter.testStatus) {
    query.testStatus = filter.testStatus;
  }
  const docs = await ProxyPool.find(query).lean();
  const list = docs.map(docToPool);
  list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return list;
}

export async function getProxyPoolById(id) {
  if (!id) return null;
  await getConnection();
  const doc = await ProxyPool.findById(id).lean();
  return docToPool(doc);
}

export async function createProxyPool(data) {
  await getConnection();
  const now = new Date();
  const id = data.id || uuidv4();

  const pool = {
    id,
    name: data.name ?? null,
    proxyUrl: data.proxyUrl ?? null,
    noProxy: data.noProxy || "",
    type: data.type || "http",
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    strictProxy: data.strictProxy === true,
    testStatus: data.testStatus || "unknown",
    lastTestedAt: data.lastTestedAt || null,
    lastError: data.lastError || null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const { id: _id, name, proxyUrl, isActive, testStatus, createdAt, updatedAt, ...rest } = pool;

  const poolDoc = {
    _id: id,
    name: name ?? null,
    proxyUrl: proxyUrl ?? null,
    isActive: isActive !== false,
    testStatus: testStatus ?? "unknown",
    data: rest,
    createdAt: now,
    updatedAt: now,
  };

  await ProxyPool.findOneAndUpdate(
    { _id: id },
    { $set: poolDoc },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return pool;
}

export async function updateProxyPool(id, data = {}) {
  if (!id) return null;
  await getConnection();
  const existingDoc = await ProxyPool.findById(id).lean();
  if (!existingDoc) return null;

  const existingPool = docToPool(existingDoc);
  const merged = { ...existingPool, ...data, updatedAt: new Date().toISOString() };
  const { id: _id, name, proxyUrl, isActive, testStatus, createdAt, updatedAt, ...rest } = merged;

  const updateFields = {
    name: name ?? null,
    proxyUrl: proxyUrl ?? null,
    isActive: isActive !== false,
    testStatus: testStatus ?? "unknown",
    data: rest,
    updatedAt: new Date(),
  };

  await ProxyPool.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true }
  ).lean();

  return merged;
}

export async function deleteProxyPool(id) {
  if (!id) return null;
  await getConnection();
  const existingDoc = await ProxyPool.findById(id).lean();
  if (!existingDoc) return null;

  const removed = docToPool(existingDoc);
  await ProxyPool.deleteOne({ _id: id });
  return removed;
}
