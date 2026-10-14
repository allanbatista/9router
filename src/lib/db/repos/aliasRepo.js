import { makeKv } from "../helpers/kvStore.js";
import { getConnection } from "../connection.js";
import { KvEntry } from "../models/KvEntry.js";

const aliasKv = makeKv("modelAliases");
const customKv = makeKv("customModels");
const mitmKv = makeKv("mitmAlias");

// modelAliases: key=alias, value=modelString
export async function getModelAliases() {
  return await aliasKv.getAll();
}

export async function setModelAlias(alias, model) {
  await aliasKv.set(alias, model);
}

export async function deleteModelAlias(alias) {
  await aliasKv.remove(alias);
}

// customModels: key=`${providerAlias}|${id}|${type}`, value=full model object
function customKey(providerAlias, id, type) {
  return `${providerAlias}|${id}|${type}`;
}

export async function getCustomModels() {
  const all = await customKv.getAll();
  return Object.values(all);
}

// Atomic check-then-insert / upsert for custom models to prevent duplicate races
export async function addCustomModel({ providerAlias, id, type = "llm", name }) {
  const k = customKey(providerAlias, id, type);
  await getConnection();
  const value = { providerAlias, id, type, name: name || id };

  const existing = await KvEntry.findOne({ scope: "customModels", key: k }).lean();
  if (existing) {
    return false;
  }

  try {
    await KvEntry.create({
      scope: "customModels",
      key: k,
      value,
      updatedAt: new Date(),
    });
    return true;
  } catch (err) {
    // E11000 duplicate key error
    if (err.code === 11000) return false;
    throw err;
  }
}

export async function deleteCustomModel({ providerAlias, id, type = "llm" }) {
  await customKv.remove(customKey(providerAlias, id, type));
}

// mitmAlias: key=toolName, value=mappings object
export async function getMitmAlias(toolName) {
  if (toolName) {
    const v = await mitmKv.get(toolName);
    return v || {};
  }
  return await mitmKv.getAll();
}

export async function setMitmAliasAll(toolName, mappings) {
  await mitmKv.set(toolName, mappings || {});
}
