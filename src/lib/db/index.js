// Public API barrel — all DB functions
import { getConnection } from "./connection.js";
import { Setting } from "./models/Setting.js";
import { ProviderConnection } from "./models/ProviderConnection.js";
import { ProviderNode } from "./models/ProviderNode.js";
import { ProxyPool } from "./models/ProxyPool.js";
import { ApiKey } from "./models/ApiKey.js";
import { Combo } from "./models/Combo.js";
import { KvEntry } from "./models/KvEntry.js";
import { exportSettings } from "./repos/settingsRepo.js";
// Settings
export {
  getSettings, updateSettings, isCloudEnabled, getCloudUrl, exportSettings,
} from "./repos/settingsRepo.js";

// Provider connections
export {
  getProviderConnections, getProviderConnectionById,
  createProviderConnection, updateProviderConnection,
  deleteProviderConnection, deleteProviderConnectionsByProvider,
  reorderProviderConnections, cleanupProviderConnections,
} from "./repos/connectionsRepo.js";

// Provider nodes
export {
  getProviderNodes, getProviderNodeById,
  createProviderNode, updateProviderNode, deleteProviderNode,
} from "./repos/nodesRepo.js";

// Proxy pools
export {
  getProxyPools, getProxyPoolById,
  createProxyPool, updateProxyPool, deleteProxyPool,
} from "./repos/proxyPoolsRepo.js";

// API keys
export {
  getApiKeys, getApiKeyById, createApiKey, updateApiKey, deleteApiKey, validateApiKey,
} from "./repos/apiKeysRepo.js";

// Combos
export {
  getCombos, getComboById, getComboByName,
  createCombo, updateCombo, deleteCombo,
} from "./repos/combosRepo.js";

// Aliases (model + custom + mitm)
export {
  getModelAliases, setModelAlias, deleteModelAlias,
  getCustomModels, addCustomModel, deleteCustomModel,
  getMitmAlias, setMitmAliasAll,
} from "./repos/aliasRepo.js";

// Pricing
export {
  getPricing, getPricingForModel, updatePricing, resetPricing, resetAllPricing,
} from "./repos/pricingRepo.js";

// Disabled models
export {
  getDisabledModels, getDisabledByProvider, disableModels, enableModels,
} from "./repos/disabledModelsRepo.js";

// Usage
export {
  statsEmitter, trackPendingRequest, getActiveRequests,
  saveRequestUsage, getUsageHistory, getUsageStats, getChartData,
  appendRequestLog, getRecentLogs,
} from "./repos/usageRepo.js";

// Request details
export {
  saveRequestDetail, getRequestDetails, getRequestDetailById, getDistinctProviders, getDistinctMetadataValues,
} from "./repos/requestDetailsRepo.js";

// Session affinity (round-robin-affinity) + combo affinity
export {
  getAffinity, setAffinity, touchAffinity, pruneExpired as pruneSessionAffinity,
  normalizeCacheKey, hashCacheKey, consistentIndex,
} from "./repos/sessionAffinityRepo.js";
export {
  getComboAffinity, setComboAffinity, touchComboAffinity, pruneComboExpired as pruneComboAffinity,
} from "./repos/comboAffinityRepo.js";
// Export/import full DB
export async function exportDb() {
  await getConnection();

  const [
    settingsData,
    connectionDocs,
    nodeDocs,
    poolDocs,
    keyDocs,
    comboDocs,
    kvDocs,
  ] = await Promise.all([
    exportSettings(),
    ProviderConnection.find({}).lean(),
    ProviderNode.find({}).lean(),
    ProxyPool.find({}).lean(),
    ApiKey.find({}).lean(),
    Combo.find({}).lean(),
    KvEntry.find({
      scope: { $in: ["modelAliases", "customModels", "mitmAlias", "pricing", "disabledModels"] },
    }).lean(),
  ]);

  const out = {
    settings: settingsData || {},
    providerConnections: connectionDocs.map((r) => {
      const extra = r.data && typeof r.data === "object" ? r.data : {};
      return {
        ...extra,
        id: r._id,
        provider: r.provider,
        authType: r.authType,
        name: r.name,
        email: r.email,
        priority: r.priority,
        isActive: r.isActive === true || r.isActive === 1,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt || new Date().toISOString()),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : (r.updatedAt || new Date().toISOString()),
      };
    }),
    providerNodes: nodeDocs.map((r) => {
      const extra = r.data && typeof r.data === "object" ? r.data : {};
      return {
        ...extra,
        id: r._id,
        type: r.type,
        name: r.name,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt || new Date().toISOString()),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : (r.updatedAt || new Date().toISOString()),
      };
    }),
    proxyPools: poolDocs.map((r) => {
      const extra = r.data && typeof r.data === "object" ? r.data : {};
      return {
        ...extra,
        id: r._id,
        isActive: r.isActive === true || r.isActive === 1,
        testStatus: r.testStatus,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt || new Date().toISOString()),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : (r.updatedAt || new Date().toISOString()),
      };
    }),
    apiKeys: keyDocs.map((r) => ({
      id: r._id,
      key: r.key,
      name: r.name,
      machineId: r.machineId,
      isActive: r.isActive === true || r.isActive === 1,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt || new Date().toISOString()),
    })),
    combos: comboDocs.map((r) => ({
      id: r._id,
      name: r.name,
      kind: r.kind,
      models: Array.isArray(r.models) ? r.models : [],
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt || new Date().toISOString()),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : (r.updatedAt || new Date().toISOString()),
    })),
    modelAliases: {},
    customModels: [],
    mitmAlias: {},
    pricing: {},
    disabledModels: {},
  };

  for (const r of kvDocs) {
    if (r.scope === "modelAliases") {
      out.modelAliases[r.key] = r.value;
    } else if (r.scope === "customModels") {
      out.customModels.push(r.value);
    } else if (r.scope === "mitmAlias") {
      out.mitmAlias[r.key] = r.value;
    } else if (r.scope === "pricing") {
      out.pricing[r.key] = r.value;
    } else if (r.scope === "disabledModels") {
      out.disabledModels[r.key] = r.value;
    }
  }

  return out;
}

export async function importDb(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid database payload");
  }
  await getConnection();

  // Wipe entities (keep telemetry/affinity/meta)
  await Promise.all([
    Setting.deleteMany({}),
    ProviderConnection.deleteMany({}),
    ProviderNode.deleteMany({}),
    ProxyPool.deleteMany({}),
    ApiKey.deleteMany({}),
    Combo.deleteMany({}),
    KvEntry.deleteMany({
      scope: { $in: ["modelAliases", "customModels", "mitmAlias", "pricing", "disabledModels"] },
    }),
  ]);

  // Settings
  if (payload.settings && typeof payload.settings === "object") {
    await Setting.findOneAndUpdate(
      { _id: "global" },
      { $set: { data: payload.settings, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  // Provider connections
  const connDocs = (payload.providerConnections || []).map((c) => {
    const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = c;
    return {
      _id: id,
      provider,
      authType: authType || "oauth",
      name: name ?? null,
      email: email ?? null,
      priority: priority ?? null,
      isActive: isActive !== false,
      data: rest,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
    };
  });
  if (connDocs.length > 0) {
    await ProviderConnection.insertMany(connDocs, { ordered: false });
  }

  // Provider nodes
  const nodeDocs = (payload.providerNodes || []).map((n) => {
    const { id, type, name, prefix, apiType, baseUrl, createdAt, updatedAt, ...rest } = n;
    return {
      _id: id,
      type: type ?? null,
      name: name ?? null,
      prefix: prefix ?? null,
      apiType: apiType ?? null,
      baseUrl: baseUrl ?? null,
      data: rest,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
    };
  });
  if (nodeDocs.length > 0) {
    await ProviderNode.insertMany(nodeDocs, { ordered: false });
  }

  // Proxy pools
  const poolDocs = (payload.proxyPools || []).map((p) => {
    const { id, name, proxyUrl, isActive, testStatus, createdAt, updatedAt, ...rest } = p;
    return {
      _id: id,
      name: name ?? null,
      proxyUrl: proxyUrl ?? null,
      isActive: isActive !== false,
      testStatus: testStatus || "unknown",
      data: rest,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
    };
  });
  if (poolDocs.length > 0) {
    await ProxyPool.insertMany(poolDocs, { ordered: false });
  }

  // API keys
  const keyDocs = (payload.apiKeys || []).map((k) => ({
    _id: k.id,
    key: k.key,
    name: k.name ?? null,
    machineId: k.machineId ?? null,
    isActive: k.isActive !== false,
    createdAt: k.createdAt ? new Date(k.createdAt) : new Date(),
  }));
  if (keyDocs.length > 0) {
    await ApiKey.insertMany(keyDocs, { ordered: false });
  }

  // Combos
  const comboDocs = (payload.combos || []).map((c) => ({
    _id: c.id,
    name: c.name,
    kind: c.kind ?? null,
    models: Array.isArray(c.models) ? c.models : [],
    createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
    updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
  }));
  if (comboDocs.length > 0) {
    await Combo.insertMany(comboDocs, { ordered: false });
  }

  // KV entries (modelAliases, customModels, mitmAlias, pricing)
  const kvEntries = [];
  const now = new Date();

  for (const [a, m] of Object.entries(payload.modelAliases || {})) {
    kvEntries.push({
      scope: "modelAliases",
      key: a,
      value: m,
      updatedAt: now,
    });
  }
  for (const m of payload.customModels || []) {
    const k = `${m.providerAlias}|${m.id}|${m.type || "llm"}`;
    kvEntries.push({
      scope: "customModels",
      key: k,
      value: m,
      updatedAt: now,
    });
  }
  for (const [tool, mappings] of Object.entries(payload.mitmAlias || {})) {
    kvEntries.push({
      scope: "mitmAlias",
      key: tool,
      value: mappings || {},
      updatedAt: now,
    });
  }
  for (const [provider, models] of Object.entries(payload.pricing || {})) {
    kvEntries.push({
      scope: "pricing",
      key: provider,
      value: models || {},
      updatedAt: now,
    });
  }
  for (const [provider, models] of Object.entries(payload.disabledModels || {})) {
    kvEntries.push({
      scope: "disabledModels",
      key: provider,
      value: Array.isArray(models) ? models : [],
      updatedAt: now,
    });
  }
  if (kvEntries.length > 0) {
    await KvEntry.insertMany(kvEntries, { ordered: false });
  }

  return await exportDb();
}

// Eager init helper (optional)
export async function initDb() {
  await getConnection();
}
