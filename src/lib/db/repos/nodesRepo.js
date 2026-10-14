import { v4 as uuidv4 } from "uuid";
import { getConnection } from "../connection.js";
import { ProviderNode } from "../models/ProviderNode.js";

function docToNode(doc) {
  if (!doc) return null;
  const extra = doc.data && typeof doc.data === "object" ? doc.data : {};
  return {
    ...extra,
    id: doc._id,
    type: doc.type,
    name: doc.name,
    prefix: doc.prefix,
    apiType: doc.apiType,
    baseUrl: doc.baseUrl,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : (doc.updatedAt || new Date().toISOString()),
  };
}

export async function getProviderNodes(filter = {}) {
  await getConnection();
  const query = {};
  if (filter.type) {
    query.type = filter.type;
  }
  const docs = await ProviderNode.find(query).lean();
  return docs.map(docToNode);
}

export async function getProviderNodeById(id) {
  if (!id) return null;
  await getConnection();
  const doc = await ProviderNode.findById(id).lean();
  return docToNode(doc);
}

export async function createProviderNode(data) {
  await getConnection();
  const now = new Date();
  const id = data.id || uuidv4();
  const { type, name, prefix, apiType, baseUrl, ...rest } = data;

  const nodeDoc = {
    _id: id,
    type: type ?? null,
    name: name ?? null,
    prefix: prefix ?? null,
    apiType: apiType ?? null,
    baseUrl: baseUrl ?? null,
    data: rest,
    createdAt: now,
    updatedAt: now,
  };

  await ProviderNode.findOneAndUpdate(
    { _id: id },
    { $set: nodeDoc },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return docToNode(nodeDoc);
}

export async function updateProviderNode(id, data = {}) {
  if (!id) return null;
  await getConnection();
  const existingDoc = await ProviderNode.findById(id).lean();
  if (!existingDoc) return null;

  const existingNode = docToNode(existingDoc);
  const merged = { ...existingNode, ...data, updatedAt: new Date().toISOString() };
  const { id: _id, type, name, prefix, apiType, baseUrl, createdAt, updatedAt, ...rest } = merged;

  const updateFields = {
    type: type ?? null,
    name: name ?? null,
    prefix: prefix ?? null,
    apiType: apiType ?? null,
    baseUrl: baseUrl ?? null,
    data: rest,
    updatedAt: new Date(),
  };

  await ProviderNode.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true }
  ).lean();

  return merged;
}

export async function deleteProviderNode(id) {
  if (!id) return null;
  await getConnection();
  const existingDoc = await ProviderNode.findById(id).lean();
  if (!existingDoc) return null;

  const removed = docToNode(existingDoc);
  await ProviderNode.deleteOne({ _id: id });
  return removed;
}
