import { v4 as uuidv4 } from "uuid";
import { getConnection } from "../connection.js";
import { Combo } from "../models/Combo.js";
import { normalizeComboDefaultEffort } from "../../../shared/constants/combo.js";

function normalizeStoredDefaultEffort(value) {
  const normalized = normalizeComboDefaultEffort(value);
  return normalized === undefined ? null : normalized;
}

function docToCombo(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    name: doc.name,
    kind: doc.kind,
    models: Array.isArray(doc.models) ? doc.models : [],
    defaultEffort: normalizeStoredDefaultEffort(doc.defaultEffort),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : (doc.updatedAt || new Date().toISOString()),
  };
}

export async function getCombos() {
  await getConnection();
  const docs = await Combo.find({}).sort({ createdAt: 1 }).lean();
  return docs.map(docToCombo);
}

export async function getComboById(id) {
  if (!id) return null;
  await getConnection();
  const doc = await Combo.findById(id).lean();
  return docToCombo(doc);
}

export async function getComboByName(name) {
  if (!name) return null;
  await getConnection();
  const doc = await Combo.findOne({ name }).lean();
  return docToCombo(doc);
}

export async function createCombo(data) {
  await getConnection();
  const now = new Date();
  const comboDoc = {
    _id: uuidv4(),
    name: data.name,
    kind: data.kind || null,
    models: data.models || [],
    defaultEffort: normalizeStoredDefaultEffort(data.defaultEffort),
    createdAt: now,
    updatedAt: now,
  };

  await Combo.create(comboDoc);
  return docToCombo(comboDoc);
}

export async function updateCombo(id, data = {}) {
  if (!id) return null;
  await getConnection();
  const existingDoc = await Combo.findById(id).lean();
  if (!existingDoc) return null;

  const existing = docToCombo(existingDoc);
  const defaultEffort = Object.prototype.hasOwnProperty.call(data, "defaultEffort")
    ? data.defaultEffort
    : existing.defaultEffort;
  const merged = {
    ...existing,
    ...data,
    defaultEffort: normalizeStoredDefaultEffort(defaultEffort),
    updatedAt: new Date().toISOString(),
  };

  await Combo.findByIdAndUpdate(
    id,
    {
      $set: {
        name: merged.name,
        kind: merged.kind,
        models: merged.models || [],
        defaultEffort: merged.defaultEffort,
        updatedAt: new Date(),
      },
    },
    { new: true }
  ).lean();

  return merged;
}

export async function deleteCombo(id) {
  if (!id) return false;
  await getConnection();
  const res = await Combo.deleteOne({ _id: id });
  return (res.deletedCount || 0) > 0;
}
