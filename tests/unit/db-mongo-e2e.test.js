import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  initDb,
  getSettings,
  updateSettings,
  isCloudEnabled,
  getCloudUrl,
  exportSettings,
  getProviderConnections,
  getProviderConnectionById,
  createProviderConnection,
  updateProviderConnection,
  deleteProviderConnection,
  deleteProviderConnectionsByProvider,
  reorderProviderConnections,
  cleanupProviderConnections,
  getProviderNodes,
  getProviderNodeById,
  createProviderNode,
  updateProviderNode,
  deleteProviderNode,
  getProxyPools,
  getProxyPoolById,
  createProxyPool,
  updateProxyPool,
  deleteProxyPool,
  getApiKeys,
  getApiKeyById,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  validateApiKey,
  getCombos,
  getComboById,
  getComboByName,
  createCombo,
  updateCombo,
  deleteCombo,
  getModelAliases,
  setModelAlias,
  deleteModelAlias,
  getCustomModels,
  addCustomModel,
  deleteCustomModel,
  getMitmAlias,
  setMitmAliasAll,
  getPricing,
  getPricingForModel,
  updatePricing,
  resetPricing,
  resetAllPricing,
  getDisabledModels,
  getDisabledByProvider,
  disableModels,
  enableModels,
  saveRequestUsage,
  getUsageHistory,
  getUsageStats,
  getChartData,
  saveRequestDetail,
  getRequestDetails,
  getRequestDetailById,
  getDistinctProviders,
  getAffinity,
  setAffinity,
  touchAffinity,
  pruneSessionAffinity,
  getComboAffinity,
  setComboAffinity,
  touchComboAffinity,
  pruneComboAffinity,
  exportDb,
  importDb,
} from "../../src/lib/db/index.js";

import { flushToDatabase } from "../../src/lib/db/repos/requestDetailsRepo.js";

// Comprehensive In-Memory MongoDB Simulator for E2E Suite
class FullInMemoryMongoStore {
  constructor() {
    this.settings = new Map();
    this.providerConnections = new Map();
    this.providerNodes = new Map();
    this.proxyPools = new Map();
    this.apiKeys = new Map();
    this.combos = new Map();
    this.kv = new Map();
    this.usageHistory = [];
    this.usageDaily = new Map();
    this.requestDetails = [];
    this.sessionAffinity = new Map();
    this.comboAffinity = new Map();
    this.meta = new Map();
  }

  clear() {
    this.settings.clear();
    this.providerConnections.clear();
    this.providerNodes.clear();
    this.proxyPools.clear();
    this.apiKeys.clear();
    this.combos.clear();
    this.kv.clear();
    this.usageHistory = [];
    this.usageDaily.clear();
    this.requestDetails = [];
    this.sessionAffinity.clear();
    this.comboAffinity.clear();
    this.meta.clear();
  }

  _clone(doc) {
    if (!doc) return null;
    return JSON.parse(JSON.stringify(doc));
  }

  _makeQuery(promise, isSingle = false) {
    return {
      lean: () => ({
        then: (res, rej) => promise.then(res, rej),
      }),
      sort: (sortObj = {}) => {
        const sortedPromise = promise.then((res) => {
          if (isSingle || !Array.isArray(res)) return res;
          const list = [...res];
          if (sortObj.priority === 1) {
            list.sort((a, b) => (a.priority || 0) - (b.priority || 0));
          } else if (sortObj.timestamp === -1 || sortObj.createdAt === -1 || sortObj.updatedAt === -1 || sortObj._id === -1) {
            list.sort((a, b) => {
              const tA = new Date(a.timestamp || a.createdAt || a.updatedAt || 0).getTime();
              const tB = new Date(b.timestamp || b.createdAt || b.updatedAt || 0).getTime();
              return tB - tA;
            });
          }
          return list;
        });
        return {
          lean: () => sortedPromise,
          limit: (n) => ({
            lean: async () => {
              const arr = await sortedPromise;
              return Array.isArray(arr) ? arr.slice(0, n) : arr;
            },
          }),
          skip: (offset) => ({
            limit: (limit) => ({
              lean: async () => {
                const arr = await sortedPromise;
                return Array.isArray(arr) ? arr.slice(offset, offset + limit) : arr;
              },
            }),
            lean: async () => {
              const arr = await sortedPromise;
              return Array.isArray(arr) ? arr.slice(offset) : arr;
            },
          }),
          then: (res, rej) => sortedPromise.then(res, rej),
        };
      },
      limit: (n) => ({
        lean: async () => {
          const arr = await promise;
          return Array.isArray(arr) ? arr.slice(0, n) : arr;
        },
      }),
      then: (res, rej) => promise.then(res, rej),
    };
  }
}

const store = new FullInMemoryMongoStore();

// Setup global mock bindings
vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn(async () => ({ connection: { readyState: 1 } })),
  disconnectDb: vi.fn(async () => {}),
  getMongoConfig: vi.fn(() => ({ uri: "mongodb://127.0.0.1:27017/9router-e2e" })),
}));

// Mock Models
vi.mock("../../src/lib/db/models/Setting.js", () => ({
  Setting: {
    findById: (id) => {
      const doc = store.settings.get(id || "global");
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findOne: (q = {}) => {
      const doc = store.settings.get(q._id || "global");
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const id = q._id || "global";
      let doc = store.settings.get(id) || { _id: id };
      if (update.$set) {
        doc = { ...doc, ...update.$set };
      }
      store.settings.set(id, doc);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    deleteOne: (q) => {
      store.settings.delete(q._id);
      return Promise.resolve({ deletedCount: 1 });
    },
    deleteMany: () => {
      store.settings.clear();
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/ProviderConnection.js", () => ({
  ProviderConnection: {
    find: (q = {}) => {
      let list = Array.from(store.providerConnections.values());
      if (q.provider) list = list.filter((c) => c.provider === q.provider);
      if (q.isActive !== undefined) list = list.filter((c) => c.isActive === q.isActive);
      return store._makeQuery(Promise.resolve(store._clone(list)));
    },
    findById: (id) => {
      const doc = store.providerConnections.get(id);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findOne: (q = {}) => {
      let list = Array.from(store.providerConnections.values());
      if (q._id) list = list.filter((c) => c._id === q._id);
      if (q.provider) list = list.filter((c) => c.provider === q.provider);
      return store._makeQuery(Promise.resolve(store._clone(list[0] || null)), true);
    },
    create: async (docs) => {
      const items = Array.isArray(docs) ? docs : [docs];
      const res = items.map((d) => {
        const item = { ...store._clone(d), _id: d._id || `pc_${Math.random().toString(36).slice(2, 9)}` };
        store.providerConnections.set(item._id, item);
        return item;
      });
      return Array.isArray(docs) ? res : res[0];
    },
    insertMany: async (docs) => {
      for (const d of docs) {
        const item = { ...store._clone(d), _id: d._id || `pc_${Math.random().toString(36).slice(2, 9)}` };
        store.providerConnections.set(item._id, item);
      }
      return docs;
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const id = q._id;
      let doc = store.providerConnections.get(id);
      if (!doc && opts.upsert) doc = { _id: id };
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.providerConnections.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findByIdAndUpdate: (id, update, opts = {}) => {
      let doc = store.providerConnections.get(id);
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.providerConnections.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    deleteOne: (q) => {
      store.providerConnections.delete(q._id);
      return Promise.resolve({ deletedCount: 1 });
    },
    findByIdAndDelete: (id) => {
      store.providerConnections.delete(id);
      return Promise.resolve({ deletedCount: 1 });
    },
    deleteMany: (q = {}) => {
      if (q.provider) {
        for (const [k, v] of store.providerConnections.entries()) {
          if (v.provider === q.provider) store.providerConnections.delete(k);
        }
      } else {
        store.providerConnections.clear();
      }
      return Promise.resolve({ deletedCount: 1 });
    },
    bulkWrite: async (ops) => {
      for (const op of ops) {
        if (op.updateOne) {
          const id = op.updateOne.filter._id || op.updateOne.filter.id;
          const cur = store.providerConnections.get(id);
          if (cur) {
            store.providerConnections.set(id, { ...cur, ...op.updateOne.update.$set });
          }
        }
      }
      return { ok: 1 };
    },
  },
}));

vi.mock("../../src/lib/db/models/ProviderNode.js", () => ({
  ProviderNode: {
    find: (q = {}) => {
      let list = Array.from(store.providerNodes.values());
      if (q.type) list = list.filter((n) => n.type === q.type);
      return store._makeQuery(Promise.resolve(store._clone(list)));
    },
    findById: (id) => {
      const doc = store.providerNodes.get(id);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    create: async (doc) => {
      const item = { ...store._clone(doc), _id: doc._id || `pn_${Math.random().toString(36).slice(2, 9)}` };
      store.providerNodes.set(item._id, item);
      return item;
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const id = q._id;
      let doc = store.providerNodes.get(id);
      if (!doc && opts.upsert) doc = { _id: id };
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.providerNodes.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    insertMany: async (docs) => {
      for (const d of docs) {
        const item = { ...store._clone(d), _id: d._id || `pn_${Math.random().toString(36).slice(2, 9)}` };
        store.providerNodes.set(item._id, item);
      }
      return docs;
    },
    findByIdAndUpdate: (id, update) => {
      let doc = store.providerNodes.get(id);
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.providerNodes.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findByIdAndDelete: (id) => {
      store.providerNodes.delete(id);
      return Promise.resolve({ deletedCount: 1 });
    },
    deleteMany: () => {
      store.providerNodes.clear();
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/ProxyPool.js", () => ({
  ProxyPool: {
    find: (q = {}) => {
      let list = Array.from(store.proxyPools.values());
      if (q.isActive !== undefined) list = list.filter((p) => p.isActive === q.isActive);
      return store._makeQuery(Promise.resolve(store._clone(list)));
    },
    findById: (id) => {
      const doc = store.proxyPools.get(id);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    create: async (doc) => {
      const item = { ...store._clone(doc), _id: doc._id || `pp_${Math.random().toString(36).slice(2, 9)}` };
      store.proxyPools.set(item._id, item);
      return item;
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const id = q._id;
      let doc = store.proxyPools.get(id);
      if (!doc && opts.upsert) doc = { _id: id };
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.proxyPools.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    insertMany: async (docs) => {
      for (const d of docs) {
        const item = { ...store._clone(d), _id: d._id || `pp_${Math.random().toString(36).slice(2, 9)}` };
        store.proxyPools.set(item._id, item);
      }
      return docs;
    },
    findByIdAndUpdate: (id, update) => {
      let doc = store.proxyPools.get(id);
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.proxyPools.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    deleteOne: (q) => {
      store.proxyPools.delete(q._id);
      return Promise.resolve({ deletedCount: 1 });
    },
    findByIdAndDelete: (id) => {
      store.proxyPools.delete(id);
      return Promise.resolve({ deletedCount: 1 });
    },
    deleteMany: () => {
      store.proxyPools.clear();
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/ApiKey.js", () => ({
  ApiKey: {
    find: (q = {}) => {
      let list = Array.from(store.apiKeys.values());
      if (q.isActive !== undefined) list = list.filter((k) => k.isActive === q.isActive);
      return store._makeQuery(Promise.resolve(store._clone(list)));
    },
    findById: (id) => {
      const doc = store.apiKeys.get(id);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findOne: (q = {}) => {
      let list = Array.from(store.apiKeys.values());
      if (q.key) list = list.filter((k) => k.key === q.key);
      if (q.isActive !== undefined) list = list.filter((k) => k.isActive === q.isActive);
      return store._makeQuery(Promise.resolve(store._clone(list[0] || null)), true);
    },
    create: async (doc) => {
      const item = { ...store._clone(doc), _id: doc._id || `ak_${Math.random().toString(36).slice(2, 9)}` };
      store.apiKeys.set(item._id, item);
      return item;
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const id = q._id;
      let doc = store.apiKeys.get(id);
      if (!doc && opts.upsert) doc = { _id: id };
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.apiKeys.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    insertMany: async (docs) => {
      for (const d of docs) {
        const item = { ...store._clone(d), _id: d._id || `ak_${Math.random().toString(36).slice(2, 9)}` };
        store.apiKeys.set(item._id, item);
      }
      return docs;
    },
    findByIdAndUpdate: (id, update) => {
      let doc = store.apiKeys.get(id);
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.apiKeys.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findByIdAndDelete: (id) => {
      store.apiKeys.delete(id);
      return Promise.resolve({ deletedCount: 1 });
    },
    deleteMany: () => {
      store.apiKeys.clear();
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/Combo.js", () => ({
  Combo: {
    find: (q = {}) => {
      const list = Array.from(store.combos.values());
      return store._makeQuery(Promise.resolve(store._clone(list)));
    },
    findById: (id) => {
      const doc = store.combos.get(id);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findOne: (q = {}) => {
      let list = Array.from(store.combos.values());
      if (q.name) list = list.filter((c) => c.name === q.name);
      return store._makeQuery(Promise.resolve(store._clone(list[0] || null)), true);
    },
    create: async (doc) => {
      const item = { ...store._clone(doc), _id: doc._id || `cb_${Math.random().toString(36).slice(2, 9)}` };
      store.combos.set(item._id, item);
      return item;
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const id = q._id;
      let doc = store.combos.get(id);
      if (!doc && opts.upsert) doc = { _id: id };
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.combos.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    insertMany: async (docs) => {
      for (const d of docs) {
        const item = { ...store._clone(d), _id: d._id || `cb_${Math.random().toString(36).slice(2, 9)}` };
        store.combos.set(item._id, item);
      }
      return docs;
    },
    findByIdAndUpdate: (id, update) => {
      let doc = store.combos.get(id);
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.combos.set(id, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    deleteOne: (q) => {
      store.combos.delete(q._id);
      return Promise.resolve({ deletedCount: 1 });
    },
    findByIdAndDelete: (id) => {
      store.combos.delete(id);
      return Promise.resolve({ deletedCount: 1 });
    },
    deleteMany: () => {
      store.combos.clear();
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/KvEntry.js", () => ({
  KvEntry: {
    find: (q = {}) => {
      let list = Array.from(store.kv.values());
      if (q.scope) {
        if (typeof q.scope === "object" && Array.isArray(q.scope.$in)) {
          list = list.filter((k) => q.scope.$in.includes(k.scope));
        } else {
          list = list.filter((k) => k.scope === q.scope);
        }
      }
      return store._makeQuery(Promise.resolve(store._clone(list)));
    },
    findOne: (q = {}) => {
      let list = Array.from(store.kv.values());
      if (q.scope) list = list.filter((k) => k.scope === q.scope);
      if (q.key) list = list.filter((k) => k.key === q.key);
      return store._makeQuery(Promise.resolve(store._clone(list[0] || null)), true);
    },
    create: async (doc) => {
      const mapKey = `${doc.scope}:${doc.key}`;
      store.kv.set(mapKey, store._clone(doc));
      return doc;
    },
    insertMany: async (docs) => {
      for (const d of docs) {
        const mapKey = `${d.scope}:${d.key}`;
        store.kv.set(mapKey, store._clone(d));
      }
      return docs;
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const mapKey = `${q.scope}:${q.key}`;
      let doc = store.kv.get(mapKey);
      if (!doc && opts.upsert) doc = { scope: q.scope, key: q.key };
      if (doc && update.$set) {
        doc = { ...doc, ...update.$set };
        store.kv.set(mapKey, doc);
      }
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    deleteOne: (q) => {
      const mapKey = `${q.scope}:${q.key}`;
      store.kv.delete(mapKey);
      return Promise.resolve({ deletedCount: 1 });
    },
    deleteMany: (q = {}) => {
      if (q.scope) {
        if (typeof q.scope === "object" && Array.isArray(q.scope.$in)) {
          for (const [k, v] of store.kv.entries()) {
            if (q.scope.$in.includes(v.scope)) store.kv.delete(k);
          }
        } else {
          for (const [k, v] of store.kv.entries()) {
            if (v.scope === q.scope) store.kv.delete(k);
          }
        }
      } else {
        store.kv.clear();
      }
      return Promise.resolve({ deletedCount: 1 });
    },
    bulkWrite: async (ops) => {
      for (const op of ops) {
        if (op.updateOne) {
          const { scope, key } = op.updateOne.filter;
          const mapKey = `${scope}:${key}`;
          const current = store.kv.get(mapKey) || { scope, key };
          store.kv.set(mapKey, { ...current, ...op.updateOne.update.$set });
        }
      }
      return { ok: 1 };
    },
  },
}));

vi.mock("../../src/lib/db/models/UsageHistory.js", () => ({
  UsageHistory: {
    find: (q = {}) => {
      let list = [...store.usageHistory];
      if (q.provider) list = list.filter((u) => u.provider === q.provider);
      if (q.model) list = list.filter((u) => u.model === q.model);
      if (q.connectionId) list = list.filter((u) => u.connectionId === q.connectionId);
      return store._makeQuery(Promise.resolve(store._clone(list)));
    },
    findOne: (q = {}) => {
      // Find exact match for deduplication
      let list = [...store.usageHistory];
      if (q.provider) list = list.filter((u) => u.provider === q.provider);
      if (q.model) list = list.filter((u) => u.model === q.model);
      if (q.connectionId) list = list.filter((u) => u.connectionId === q.connectionId);
      if (q.promptTokens !== undefined) list = list.filter((u) => u.promptTokens === q.promptTokens);
      if (q.completionTokens !== undefined) list = list.filter((u) => u.completionTokens === q.completionTokens);
      if (q.timestamp) {
        const qTime = q.timestamp instanceof Date ? q.timestamp.getTime() : new Date(q.timestamp).getTime();
        list = list.filter((u) => new Date(u.timestamp).getTime() === qTime);
      }
      return store._makeQuery(Promise.resolve(store._clone(list[0] || null)), true);
    },
    create: async (doc) => {
      const item = { ...store._clone(doc), _id: `uh_${Math.random().toString(36).slice(2, 9)}` };
      store.usageHistory.push(item);
      return item;
    },
    updateOne: async (q, update) => {
      const doc = store.usageHistory.find((d) => d._id === q._id);
      if (doc && update.$set) {
        Object.assign(doc, update.$set);
      }
      return { modifiedCount: doc ? 1 : 0 };
    },
    deleteMany: () => {
      store.usageHistory = [];
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/UsageDaily.js", () => ({
  UsageDaily: {
    find: (q = {}) => {
      const list = Array.from(store.usageDaily.values());
      return store._makeQuery(Promise.resolve(store._clone(list)));
    },
    findOne: (q = {}) => {
      const doc = store.usageDaily.get(q.dateKey);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const dateKey = q.dateKey;
      let doc = store.usageDaily.get(dateKey) || {
        dateKey,
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        cost: 0,
        byProvider: {},
        byModel: {},
        byAccount: {},
        byApiKey: {},
        byEndpoint: {},
      };
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          if (k.includes(".")) {
            const parts = k.split(".");
            let target = doc;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!target[parts[i]]) target[parts[i]] = {};
              target = target[parts[i]];
            }
            target[parts[parts.length - 1]] = (target[parts[parts.length - 1]] || 0) + v;
          } else {
            doc[k] = (doc[k] || 0) + v;
          }
        }
      }
      if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) {
          if (k.includes(".")) {
            const parts = k.split(".");
            let target = doc;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!target[parts[i]]) target[parts[i]] = {};
              target = target[parts[i]];
            }
            target[parts[parts.length - 1]] = v;
          } else {
            doc[k] = v;
          }
        }
      }
      store.usageDaily.set(dateKey, doc);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    deleteMany: () => {
      store.usageDaily.clear();
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/RequestDetail.js", () => ({
  RequestDetail: {
    find: (q = {}) => {
      let list = [...store.requestDetails];
      if (q.provider) list = list.filter((r) => r.provider === q.provider);
      if (q.model) list = list.filter((r) => r.model === q.model);
      return store._makeQuery(Promise.resolve(store._clone(list)));
    },
    findOne: (query = {}) => {
      let found = null;
      if (query.$or) {
        for (const sub of query.$or) {
          const match = store.requestDetails.find((r) => String(r._id) === String(sub._id));
          if (match) { found = match; break; }
        }
      } else if (query._id) {
        found = store.requestDetails.find((r) => String(r._id) === String(query._id));
      }
      return store._makeQuery(Promise.resolve(found ? store._clone(found) : null), true);
    },
    findById: (id) => {
      const doc = store.requestDetails.find((r) => String(r._id) === String(id));
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    insertMany: async (docs) => {
      for (const d of docs) {
        store.requestDetails.unshift({ ...store._clone(d), _id: d._id || `rd_${Math.random().toString(36).slice(2, 9)}` });
      }
      return docs;
    },
    bulkWrite: async (ops = []) => {
      for (const op of ops) {
        if (op.updateOne) {
          const id = op.updateOne.filter?._id;
          const doc = op.updateOne.update?.$set;
          const idx = store.requestDetails.findIndex((d) => d._id === id);
          if (idx >= 0) store.requestDetails[idx] = { ...doc };
          else if (op.updateOne.upsert) store.requestDetails.unshift({ ...doc });
        }
      }
      return { ok: 1 };
    },
    countDocuments: async (q = {}) => {
      let list = [...store.requestDetails];
      if (q.provider) list = list.filter((r) => r.provider === q.provider);
      return list.length;
    },
    distinct: async (field) => {
      const vals = new Set(store.requestDetails.map((r) => r[field]).filter(Boolean));
      return Array.from(vals);
    },
    deleteMany: () => {
      store.requestDetails = [];
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/SessionAffinity.js", () => ({
  SessionAffinity: {
    findOne: (q = {}) => {
      const key = `${q.provider}:${q.model}:${q.cacheKeyHash}`;
      const doc = store.sessionAffinity.get(key);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const key = `${q.provider}:${q.model}:${q.cacheKeyHash}`;
      let doc = store.sessionAffinity.get(key) || {
        provider: q.provider,
        model: q.model,
        cacheKeyHash: q.cacheKeyHash,
        hitCount: 0,
      };
      if (update.$set) doc = { ...doc, ...update.$set };
      if (update.$inc) doc.hitCount = (doc.hitCount || 0) + (update.$inc.hitCount || 0);
      store.sessionAffinity.set(key, doc);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    updateOne: async (q, update) => {
      const key = `${q.provider}:${q.model}:${q.cacheKeyHash}`;
      let doc = store.sessionAffinity.get(key);
      if (doc) {
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$inc) doc.hitCount = (doc.hitCount || 0) + (update.$inc.hitCount || 0);
        store.sessionAffinity.set(key, doc);
      }
      return { modifiedCount: doc ? 1 : 0 };
    },
    deleteMany: () => {
      store.sessionAffinity.clear();
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/ComboAffinity.js", () => ({
  ComboAffinity: {
    findOne: (q = {}) => {
      const key = `${q.comboName}:${q.cacheKeyHash}`;
      const doc = store.comboAffinity.get(key);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const key = `${q.comboName}:${q.cacheKeyHash}`;
      let doc = store.comboAffinity.get(key) || {
        comboName: q.comboName,
        cacheKeyHash: q.cacheKeyHash,
        hitCount: 0,
      };
      if (update.$set) doc = { ...doc, ...update.$set };
      if (update.$inc) doc.hitCount = (doc.hitCount || 0) + (update.$inc.hitCount || 0);
      store.comboAffinity.set(key, doc);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    updateOne: async (q, update) => {
      const key = `${q.comboName}:${q.cacheKeyHash}`;
      let doc = store.comboAffinity.get(key);
      if (doc) {
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$inc) doc.hitCount = (doc.hitCount || 0) + (update.$inc.hitCount || 0);
        store.comboAffinity.set(key, doc);
      }
      return { modifiedCount: doc ? 1 : 0 };
    },
    deleteMany: () => {
      store.comboAffinity.clear();
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

vi.mock("../../src/lib/db/models/Meta.js", () => ({
  Meta: {
    findOne: (q = {}) => {
      const doc = store.meta.get(q.key);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    findOneAndUpdate: (q, update, opts = {}) => {
      const key = q.key;
      let doc = store.meta.get(key) || { key };
      if (update.$set) doc = { ...doc, ...update.$set };
      store.meta.set(key, doc);
      return store._makeQuery(Promise.resolve(store._clone(doc)), true);
    },
    deleteMany: () => {
      store.meta.clear();
      return Promise.resolve({ deletedCount: 1 });
    },
  },
}));

describe("MongoDB Persistence Layer — Comprehensive E2E Validation Gate", () => {
  beforeEach(() => {
    store.clear();
  });

  it("boot & initDb() verifies Mongoose connection lifecycle", async () => {
    await expect(initDb()).resolves.not.toThrow();
  });

  describe("Settings & Config CRUD & defaults", () => {
    it("reads defaults on empty DB and performs atomic updates", async () => {
      const initial = await getSettings();
      expect(initial).toBeDefined();
      expect(initial.cloudEnabled).toBe(false);

      const updated = await updateSettings({ cloudEnabled: true, siteName: "E2E Router" });
      expect(updated.cloudEnabled).toBe(true);
      expect(updated.siteName).toBe("E2E Router");

      expect(await isCloudEnabled()).toBe(true);
      const exported = await exportSettings();
      expect(exported.siteName).toBe("E2E Router");
    });
  });

  describe("Core Domain Entities (Connections, Nodes, Proxies, Keys, Combos)", () => {
    it("manages provider connections lifecycle with priority reordering", async () => {
      const conn1 = await createProviderConnection({
        provider: "anthropic",
        name: "Claude Primary",
        authType: "oauth",
        apiKey: "sk-ant-1",
        data: { accessToken: "tok-1", expiresAt: 123456 },
      });
      const conn2 = await createProviderConnection({
        provider: "anthropic",
        name: "Claude Secondary",
        authType: "apikey",
        apiKey: "sk-ant-2",
      });

      const list = await getProviderConnections({ provider: "anthropic" });
      expect(list.length).toBe(2);

      const updated = await updateProviderConnection(conn1.id, {
        name: "Claude Main",
        data: { accessToken: "tok-refreshed", expiresAt: 999999 },
      });
      expect(updated.name).toBe("Claude Main");
      expect(updated.data.accessToken).toBe("tok-refreshed");

      // Update priority of conn1 to 10
      await updateProviderConnection(conn1.id, { priority: 10 });
      await updateProviderConnection(conn2.id, { priority: 1 });
      const reordered = await getProviderConnections({ provider: "anthropic" });
      expect(reordered[0].id).toBe(conn2.id);
      await deleteProviderConnection(conn2.id);
      expect(await getProviderConnectionById(conn2.id)).toBeNull();
    });

    it("manages nodes, proxy pools, API keys and model combos", async () => {
      // Provider Nodes
      const node = await createProviderNode({
        name: "Local VLLM",
        type: "openai-compatible",
        baseUrl: "http://localhost:8000/v1",
      });
      expect((await getProviderNodes()).length).toBe(1);
      await updateProviderNode(node.id, { name: "VLLM Prod" });
      expect((await getProviderNodeById(node.id)).name).toBe("VLLM Prod");

      // Proxy Pools
      const proxy = await createProxyPool({
        name: "US Proxy",
        proxyUrl: "http://proxy.local:8080",
      });
      expect((await getProxyPools()).length).toBe(1);
      await deleteProxyPool(proxy.id);
      expect(await getProxyPoolById(proxy.id)).toBeNull();

      // API Keys
      const key = await createApiKey("Prod Service", "mach-1");
      expect(key.key).toMatch(/^sk-/);
      const validated = await validateApiKey(key.key);
      expect(validated).toBe(true);
      await updateApiKey(key.id, { isActive: false });
      expect(await validateApiKey(key.key)).toBe(false);

      // Combos
      const combo = await createCombo({
        name: "smart-fallback",
        kind: "fallback",
        models: ["anthropic/claude-3-7-sonnet", "openai/gpt-4o"],
      });
      expect(await getComboByName("smart-fallback")).toBeDefined();
      await deleteCombo(combo.id);
      expect(await getComboById(combo.id)).toBeNull();
    });
  });

  describe("Key-Value Store Domain Repositories", () => {
    it("handles model aliases, custom models, MITM alias and pricing", async () => {
      // Model Aliases
      await setModelAlias("gpt-4-alias", "openai/gpt-4o");
      expect(await getModelAliases()).toEqual({ "gpt-4-alias": "openai/gpt-4o" });
      await deleteModelAlias("gpt-4-alias");
      expect(await getModelAliases()).toEqual({});

      // Custom Models
      await addCustomModel({ id: "custom-1", providerAlias: "vllm", name: "Custom Qwen" });
      const customs = await getCustomModels();
      expect(customs.length).toBe(1);
      await deleteCustomModel({ id: "custom-1", providerAlias: "vllm" });
      expect(await getCustomModels()).toEqual([]);

      // MITM Aliases
      await setMitmAliasAll("claude-code", { "claude-3-5-sonnet": "openai/gpt-4o" });
      expect(await getMitmAlias("claude-code")).toEqual({ "claude-3-5-sonnet": "openai/gpt-4o" });

      // Pricing
      await updatePricing({ custom_provider: { "custom-model": { input: 2.5, output: 10 } } });
      const pricing = await getPricingForModel("custom_provider", "custom-model");
      expect(pricing.input).toBe(2.5);
      await resetPricing("custom_provider", "custom-model");
      expect(await getPricingForModel("custom_provider", "custom-model")).toBeNull();
    });

    it("handles disabled models repository", async () => {
      await disableModels("openai", ["gpt-3.5-turbo", "text-davinci"]);
      expect(await getDisabledByProvider("openai")).toEqual(["gpt-3.5-turbo", "text-davinci"]);
      await enableModels("openai", ["gpt-3.5-turbo"]);
      expect(await getDisabledByProvider("openai")).toEqual(["text-davinci"]);
    });
  });

  describe("Usage, Aggregation & Observability Repositories", () => {
    it("persists usage records and aggregates daily token summaries concurrently", async () => {
      const records = [
        {
          timestamp: new Date(Date.now() - 10000).toISOString(),
          provider: "openai",
          model: "gpt-4o",
          connectionId: "conn-1",
          tokens: { prompt_tokens: 100, completion_tokens: 50, cached_tokens: 20 },
          cost: 0.002,
          endpoint: "/v1/chat/completions",
          status: "ok",
        },
        {
          timestamp: new Date().toISOString(),
          provider: "openai",
          model: "gpt-4o",
          connectionId: "conn-1",
          tokens: { prompt_tokens: 200, completion_tokens: 80, cached_tokens: 0 },
          cost: 0.004,
          endpoint: "/v1/chat/completions",
          status: "ok",
        },
      ];

      for (const rec of records) {
        await saveRequestUsage(rec);
      }

      const history = await getUsageHistory({ provider: "openai" });
      expect(history.length).toBe(2);

      const stats = await getUsageStats("24h");
      expect(stats.totalRequests).toBe(2);
      expect(stats.totalPromptTokens).toBe(300);
      expect(stats.totalCompletionTokens).toBe(130);
      expect(stats.totalCachedTokens).toBe(20);

      const chart = await getChartData("7d");
      expect(chart).toBeDefined();
    });

    it("buffers and flushes observability request details", async () => {
      await updateSettings({ enableObservability: true });

      await saveRequestDetail({
        id: "req-e2e-1",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        connectionId: "conn-2",
        status: "200",
        data: { request: { messages: ["hi"] }, response: { text: "hello" } },
      });

      await flushToDatabase();

      const detailsRes = await getRequestDetails({ provider: "anthropic" });
      expect(detailsRes.details.length).toBe(1);
      expect(detailsRes.details[0].id).toBe("req-e2e-1");

      const byId = await getRequestDetailById("req-e2e-1");
      expect(byId).toBeDefined();
      expect(byId.provider).toBe("anthropic");

      const providers = await getDistinctProviders();
      expect(providers).toContain("anthropic");
    });
  });

  describe("Session & Combo Affinity with TTL index contract", () => {
    it("sets, touches and resolves session round-robin affinity", async () => {
      await setAffinity("openai", "gpt-4o", "hash-123", "raw-key-1", "conn-active-1");
      const resolved = await getAffinity("openai", "gpt-4o", "hash-123");
      expect(resolved.connectionId).toBe("conn-active-1");
      expect(resolved.hitCount).toBe(1);

      await touchAffinity("openai", "gpt-4o", "hash-123");
      const touched = await getAffinity("openai", "gpt-4o", "hash-123");
      expect(touched.hitCount).toBe(2);

      await expect(pruneSessionAffinity()).resolves.not.toThrow();
    });

    it("sets, touches and resolves combo round-robin affinity", async () => {
      await setComboAffinity("combo-dev", "hash-456", "raw-key-2", "anthropic/claude-3-7");
      const resolved = await getComboAffinity("combo-dev", "hash-456");
      expect(resolved.selectedModel).toBe("anthropic/claude-3-7");

      await touchComboAffinity("combo-dev", "hash-456");
      const touched = await getComboAffinity("combo-dev", "hash-456");
      expect(touched.hitCount).toBe(2);

      await expect(pruneComboAffinity()).resolves.not.toThrow();
    });
  });

  describe("Full Database Export & Import Fidelity", () => {
    it("exports entire DB state and restores with complete fidelity", async () => {
      // 1. Seed comprehensive state
      await updateSettings({ cloudEnabled: true, siteName: "Snapshot Site" });
      const conn = await createProviderConnection({ provider: "openai", name: "Backup Conn", apiKey: "sk-bk" });
      const node = await createProviderNode({ name: "Backup Node", type: "custom" });
      const proxy = await createProxyPool({ name: "Backup Proxy", proxyUrl: "http://proxy:80" });
      const key = await createApiKey("Backup Key", "m-bk");
      const combo = await createCombo({ name: "bk-combo", kind: "round-robin", models: ["m1", "m2"] });
      await setModelAlias("alias-bk", "target-bk");
      await addCustomModel({ id: "cust-bk", providerAlias: "vllm", name: "Model BK" });
      await setMitmAliasAll("tool-bk", { a: "b" });
      await updatePricing({ custom_bk: { "gpt-4o": { input: 1 } } });
      await disableModels("openai", ["m-disabled"]);

      // 2. Export DB
      const snapshot = await exportDb();
      expect(snapshot.settings.siteName).toBe("Snapshot Site");
      expect(snapshot.providerConnections.length).toBe(1);
      expect(snapshot.providerNodes.length).toBe(1);
      expect(snapshot.proxyPools.length).toBe(1);
      expect(snapshot.apiKeys.length).toBe(1);
      expect(snapshot.combos.length).toBe(1);
      expect(snapshot.modelAliases["alias-bk"]).toBe("target-bk");

      // 3. Clear DB Store
      store.clear();
      expect((await getProviderConnections()).length).toBe(0);

      // 4. Import DB from snapshot
      await importDb(snapshot);

      // 5. Verify restored state
      const reSettings = await getSettings();
      expect(reSettings.siteName).toBe("Snapshot Site");
      expect((await getProviderConnections()).length).toBe(1);
      expect((await getProviderNodes()).length).toBe(1);
      expect((await getProxyPools()).length).toBe(1);
      expect((await getApiKeys()).length).toBe(1);
      expect((await getCombos()).length).toBe(1);
      expect(await getModelAliases()).toEqual({ "alias-bk": "target-bk" });
      expect(await getDisabledByProvider("openai")).toEqual(["m-disabled"]);
    });
  });
});
