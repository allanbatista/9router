import { describe, expect, it, beforeEach, vi } from "vitest";
import { exportDb, importDb } from "../../src/lib/db/index.js";
import { Setting } from "../../src/lib/db/models/Setting.js";
import { ProviderConnection } from "../../src/lib/db/models/ProviderConnection.js";
import { ProviderNode } from "../../src/lib/db/models/ProviderNode.js";
import { ProxyPool } from "../../src/lib/db/models/ProxyPool.js";
import { ApiKey } from "../../src/lib/db/models/ApiKey.js";
import { Combo } from "../../src/lib/db/models/Combo.js";
import { KvEntry } from "../../src/lib/db/models/KvEntry.js";
import { ChatSession } from "../../src/lib/db/models/ChatSession.js";

vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn().mockResolvedValue({ connection: { readyState: 1 } }),
  disconnectDb: vi.fn().mockResolvedValue(),
  getMongoConfig: vi.fn().mockReturnValue({ uri: "mongodb://127.0.0.1:27017/9router" }),
}));

// Mock Mongoose in-memory collection helper
class InMemoryStore {
  constructor() {
    this.docs = new Map();
  }

  clear() {
    this.docs.clear();
  }

  _clone(doc) {
    if (!doc) return null;
    return JSON.parse(JSON.stringify(doc));
  }

  _makeQuery(promise) {
    const q = promise;
    q.lean = () => q;
    q.sort = () => q;
    return q;
  }

  find(query = {}) {
    return this._makeQuery(
      (async () => {
        const results = [];
        for (const doc of this.docs.values()) {
          let match = true;
          for (const [k, v] of Object.entries(query)) {
            if (k === "scope" && v && typeof v === "object" && Array.isArray(v.$in)) {
              if (!v.$in.includes(doc.scope)) {
                match = false;
                break;
              }
            } else if (doc[k] !== v) {
              match = false;
              break;
            }
          }
          if (match) results.push(this._clone(doc));
        }
        return results;
      })()
    );
  }

  findById(id) {
    return this._makeQuery(
      (async () => {
        const doc = this.docs.get(id);
        return this._clone(doc);
      })()
    );
  }

  findOne(query = {}) {
    return this._makeQuery(
      (async () => {
        for (const doc of this.docs.values()) {
          let match = true;
          for (const [k, v] of Object.entries(query)) {
            if (doc[k] !== v) {
              match = false;
              break;
            }
          }
          if (match) return this._clone(doc);
        }
        return null;
      })()
    );
  }

  async findOneAndUpdate(query, update, options = {}) {
    let key = query._id || (query.scope && query.key ? `${query.scope}:${query.key}` : null);
    let doc = null;

    if (key) {
      doc = this.docs.get(key);
    } else {
      for (const [k, d] of this.docs.entries()) {
        let match = true;
        for (const [qk, qv] of Object.entries(query)) {
          if (d[qk] !== qv) {
            match = false;
            break;
          }
        }
        if (match) {
          doc = d;
          key = k;
          break;
        }
      }
    }

    if (!doc && options.upsert) {
      doc = { ...query };
      if (!key) {
        key = query._id || (query.scope && query.key ? `${query.scope}:${query.key}` : Math.random().toString());
      }
      doc._id = query._id || key;
    }

    if (doc) {
      if (update.$set) {
        Object.assign(doc, update.$set);
      } else {
        Object.assign(doc, update);
      }
      this.docs.set(key, this._clone(doc));
      return this._clone(doc);
    }
    return null;
  }

  async insertMany(docs = []) {
    for (const d of docs) {
      const key = d._id || (d.scope && d.key ? `${d.scope}:${d.key}` : Math.random().toString());
      const item = { ...d, _id: d._id || key };
      this.docs.set(key, this._clone(item));
    }
    return docs;
  }

  async deleteMany(query = {}) {
    if (Object.keys(query).length === 0) {
      this.docs.clear();
      return { deletedCount: this.docs.size };
    }
    let count = 0;
    for (const [k, doc] of this.docs.entries()) {
      let match = true;
      for (const [qk, qv] of Object.entries(query)) {
        if (qk === "scope" && qv && typeof qv === "object" && Array.isArray(qv.$in)) {
          if (!qv.$in.includes(doc.scope)) {
            match = false;
            break;
          }
        } else if (doc[qk] !== qv) {
          match = false;
          break;
        }
      }
      if (match) {
        this.docs.delete(k);
        count++;
      }
    }
    return { deletedCount: count };
  }
}

const mockStores = {
  Setting: new InMemoryStore(),
  ProviderConnection: new InMemoryStore(),
  ProviderNode: new InMemoryStore(),
  ProxyPool: new InMemoryStore(),
  ApiKey: new InMemoryStore(),
  Combo: new InMemoryStore(),
  KvEntry: new InMemoryStore(),
  ChatSession: new InMemoryStore(),
};

describe("Snapshot Export & Import Utility (V8)", () => {
  beforeEach(() => {
    for (const store of Object.values(mockStores)) {
      store.clear();
    }

    // Mock models
    Setting.find = (...args) => mockStores.Setting.find(...args);
    Setting.findById = (...args) => mockStores.Setting.findById(...args);
    Setting.findOneAndUpdate = (...args) => mockStores.Setting.findOneAndUpdate(...args);
    Setting.deleteMany = (...args) => mockStores.Setting.deleteMany(...args);

    ProviderConnection.find = (...args) => mockStores.ProviderConnection.find(...args);
    ProviderConnection.findById = (...args) => mockStores.ProviderConnection.findById(...args);
    ProviderConnection.findOneAndUpdate = (...args) => mockStores.ProviderConnection.findOneAndUpdate(...args);
    ProviderConnection.insertMany = (...args) => mockStores.ProviderConnection.insertMany(...args);
    ProviderConnection.deleteMany = (...args) => mockStores.ProviderConnection.deleteMany(...args);

    ProviderNode.find = (...args) => mockStores.ProviderNode.find(...args);
    ProviderNode.findById = (...args) => mockStores.ProviderNode.findById(...args);
    ProviderNode.findOneAndUpdate = (...args) => mockStores.ProviderNode.findOneAndUpdate(...args);
    ProviderNode.insertMany = (...args) => mockStores.ProviderNode.insertMany(...args);
    ProviderNode.deleteMany = (...args) => mockStores.ProviderNode.deleteMany(...args);

    ProxyPool.find = (...args) => mockStores.ProxyPool.find(...args);
    ProxyPool.findById = (...args) => mockStores.ProxyPool.findById(...args);
    ProxyPool.findOneAndUpdate = (...args) => mockStores.ProxyPool.findOneAndUpdate(...args);
    ProxyPool.insertMany = (...args) => mockStores.ProxyPool.insertMany(...args);
    ProxyPool.deleteMany = (...args) => mockStores.ProxyPool.deleteMany(...args);

    ApiKey.find = (...args) => mockStores.ApiKey.find(...args);
    ApiKey.findById = (...args) => mockStores.ApiKey.findById(...args);
    ApiKey.findOneAndUpdate = (...args) => mockStores.ApiKey.findOneAndUpdate(...args);
    ApiKey.insertMany = (...args) => mockStores.ApiKey.insertMany(...args);
    ApiKey.deleteMany = (...args) => mockStores.ApiKey.deleteMany(...args);

    Combo.find = (...args) => mockStores.Combo.find(...args);
    Combo.findById = (...args) => mockStores.Combo.findById(...args);
    Combo.findOneAndUpdate = (...args) => mockStores.Combo.findOneAndUpdate(...args);
    Combo.insertMany = (...args) => mockStores.Combo.insertMany(...args);
    Combo.deleteMany = (...args) => mockStores.Combo.deleteMany(...args);

    ChatSession.find = (...args) => mockStores.ChatSession.find(...args);
    ChatSession.findById = (...args) => mockStores.ChatSession.findById(...args);
    ChatSession.findOneAndUpdate = (...args) => mockStores.ChatSession.findOneAndUpdate(...args);
    ChatSession.insertMany = (...args) => mockStores.ChatSession.insertMany(...args);
    ChatSession.deleteMany = (...args) => mockStores.ChatSession.deleteMany(...args);

    KvEntry.find = (...args) => mockStores.KvEntry.find(...args);
    KvEntry.findById = (...args) => mockStores.KvEntry.findById(...args);
    KvEntry.findOne = (...args) => mockStores.KvEntry.findOne(...args);
    KvEntry.findOneAndUpdate = (...args) => mockStores.KvEntry.findOneAndUpdate(...args);
    KvEntry.insertMany = (...args) => mockStores.KvEntry.insertMany(...args);
    KvEntry.deleteMany = (...args) => mockStores.KvEntry.deleteMany(...args);
  });

  it("exports an empty default database structure when collections are empty", async () => {
    const exported = await exportDb();

    expect(exported).toBeDefined();
    expect(exported.settings).toEqual({});
    expect(exported.providerConnections).toEqual([]);
    expect(exported.providerNodes).toEqual([]);
    expect(exported.proxyPools).toEqual([]);
    expect(exported.apiKeys).toEqual([]);
    expect(exported.combos).toEqual([]);
    expect(exported.modelAliases).toEqual({});
    expect(exported.customModels).toEqual([]);
    expect(exported.mitmAlias).toEqual({});
    expect(exported.pricing).toEqual({});
  });

  it("imports full snapshot and restores state with high fidelity across all collections", async () => {
    const snapshot = {
      settings: {
        cloudEnabled: true,
        tunnelEnabled: false,
        authMode: "password",
        requireLogin: true,
      },
      providerConnections: [
        {
          id: "conn-1",
          provider: "openai",
          authType: "apikey",
          name: "OpenAI Prod",
          email: null,
          priority: 1,
          isActive: true,
          apiKey: "sk-proj-test123",
          organizationId: "org-xyz",
          createdAt: "2026-08-20T10:00:00.000Z",
          updatedAt: "2026-08-20T10:00:00.000Z",
        },
        {
          id: "conn-2",
          provider: "anthropic",
          authType: "oauth",
          name: "Claude Team",
          email: "team@company.com",
          priority: 2,
          isActive: false,
          accessToken: "token-abc",
          refreshToken: "refresh-xyz",
          createdAt: "2026-08-21T12:00:00.000Z",
          updatedAt: "2026-08-21T12:00:00.000Z",
        },
      ],
      providerNodes: [
        {
          id: "node-1",
          type: "custom-ollama",
          name: "Local Ollama GPU",
          prefix: "ollama",
          apiType: "openai",
          baseUrl: "http://127.0.0.1:11434/v1",
          customHeaders: { Authorization: "Bearer test" },
          createdAt: "2026-08-21T08:00:00.000Z",
          updatedAt: "2026-08-21T08:00:00.000Z",
        },
      ],
      proxyPools: [
        {
          id: "pool-1",
          name: "EU Residential Proxy",
          proxyUrl: "http://user:pass@proxy.eu.net:8080",
          isActive: true,
          testStatus: "healthy",
          lastChecked: "2026-08-22T00:00:00.000Z",
          createdAt: "2026-08-22T00:00:00.000Z",
          updatedAt: "2026-08-22T00:00:00.000Z",
        },
      ],
      apiKeys: [
        {
          id: "key-1",
          key: "9r-live-secretkey12345",
          name: "Production Worker",
          machineId: "mach-888",
          isActive: true,
          createdAt: "2026-08-22T01:00:00.000Z",
        },
      ],
      combos: [
        {
          id: "combo-1",
          name: "gpt-and-claude-fallback",
          kind: "fallback",
          models: [
            { provider: "openai", model: "gpt-4o" },
            { provider: "anthropic", model: "claude-3-5-sonnet" },
          ],
          createdAt: "2026-08-22T02:00:00.000Z",
          updatedAt: "2026-08-22T02:00:00.000Z",
        },
      ],
      modelAliases: {
        "gpt-4": "gpt-4o",
        "claude-latest": "claude-3-5-sonnet-20241022",
      },
      customModels: [
        {
          providerAlias: "ollama",
          id: "llama3.1:70b",
          type: "llm",
          name: "Llama 3.1 70B",
        },
      ],
      mitmAlias: {
        cursor: {
          "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
        },
      },
      pricing: {
        openai: {
          "gpt-4o": { prompt: 5, completion: 15 },
        },
      },
    };

    const imported = await importDb(snapshot);

    expect(imported).toBeDefined();
    expect(imported.settings).toEqual(snapshot.settings);
    expect(imported.providerConnections).toHaveLength(2);
    expect(imported.providerConnections[0].id).toBe("conn-1");
    expect(imported.providerConnections[0].apiKey).toBe("sk-proj-test123");
    expect(imported.providerConnections[0].organizationId).toBe("org-xyz");
    expect(imported.providerConnections[1].id).toBe("conn-2");
    expect(imported.providerConnections[1].isActive).toBe(false);

    expect(imported.providerNodes).toHaveLength(1);
    expect(imported.providerNodes[0].id).toBe("node-1");
    expect(imported.providerNodes[0].customHeaders).toEqual({ Authorization: "Bearer test" });

    expect(imported.proxyPools).toHaveLength(1);
    expect(imported.proxyPools[0].id).toBe("pool-1");
    expect(imported.proxyPools[0].lastChecked).toBe("2026-08-22T00:00:00.000Z");

    expect(imported.apiKeys).toHaveLength(1);
    expect(imported.apiKeys[0].id).toBe("key-1");
    expect(imported.apiKeys[0].key).toBe("9r-live-secretkey12345");

    expect(imported.combos).toHaveLength(1);
    expect(imported.combos[0].name).toBe("gpt-and-claude-fallback");
    expect(imported.combos[0].models).toHaveLength(2);

    expect(imported.modelAliases).toEqual({
      "gpt-4": "gpt-4o",
      "claude-latest": "claude-3-5-sonnet-20241022",
    });

    expect(imported.customModels).toHaveLength(1);
    expect(imported.customModels[0].id).toBe("llama3.1:70b");

    expect(imported.mitmAlias).toEqual({
      cursor: {
        "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
      },
    });

    expect(imported.pricing).toEqual({
      openai: {
        "gpt-4o": { prompt: 5, completion: 15 },
      },
    });

    // Roundtrip verification: export again
    const secondExport = await exportDb();
    expect(secondExport).toEqual(imported);
  });

  it("throws an error when invalid payload is passed to importDb", async () => {
    await expect(importDb(null)).rejects.toThrow("Invalid database payload");
    await expect(importDb("string")).rejects.toThrow("Invalid database payload");
    await expect(importDb([1, 2, 3])).rejects.toThrow("Invalid database payload");
  });

  it("replaces existing records on subsequent import without data leaks", async () => {
    const initialSnapshot = {
      settings: { cloudEnabled: false },
      apiKeys: [
        { id: "key-old", key: "9r-old-key", name: "Old", machineId: "mach-1", isActive: true },
      ],
      modelAliases: { "old-alias": "old-model" },
    };

    await importDb(initialSnapshot);
    const firstExport = await exportDb();
    expect(firstExport.apiKeys).toHaveLength(1);
    expect(firstExport.apiKeys[0].id).toBe("key-old");

    const newSnapshot = {
      settings: { cloudEnabled: true },
      apiKeys: [
        { id: "key-new", key: "9r-new-key", name: "New", machineId: "mach-2", isActive: true },
      ],
      modelAliases: { "new-alias": "new-model" },
    };

    await importDb(newSnapshot);
    const secondExport = await exportDb();
    expect(secondExport.apiKeys).toHaveLength(1);
    expect(secondExport.apiKeys[0].id).toBe("key-new");
    expect(secondExport.modelAliases).toEqual({ "new-alias": "new-model" });
    expect(secondExport.settings).toEqual({ cloudEnabled: true });
  });
});
