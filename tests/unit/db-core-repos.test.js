import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getProviderNodes,
  getProviderNodeById,
  createProviderNode,
  updateProviderNode,
  deleteProviderNode,
} from "../../src/lib/db/repos/nodesRepo.js";
import {
  getProxyPools,
  getProxyPoolById,
  createProxyPool,
  updateProxyPool,
  deleteProxyPool,
} from "../../src/lib/db/repos/proxyPoolsRepo.js";
import {
  getApiKeys,
  getApiKeyById,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  validateApiKey,
} from "../../src/lib/db/repos/apiKeysRepo.js";
import {
  getCombos,
  getComboById,
  getComboByName,
  createCombo,
  updateCombo,
  deleteCombo,
} from "../../src/lib/db/repos/combosRepo.js";

// In-memory store helper
class GenericInMemoryCollection {
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
            if (doc[k] !== v) {
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
        const doc = this.docs.get(String(id));
        return doc ? this._clone(doc) : null;
      })()
    );
  }

  findOne(query) {
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

  findByIdAndUpdate(id, update, options = {}) {
    return this._makeQuery(
      (async () => {
        const target = this.docs.get(String(id));
        if (!target) return null;
        if (update.$set) {
          Object.assign(target, update.$set);
        }
        this.docs.set(String(id), target);
        return this._clone(target);
      })()
    );
  }

  findOneAndUpdate(query, update, options = {}) {
    return this._makeQuery(
      (async () => {
        let target = null;
        let targetId = query._id ? String(query._id) : null;

        if (targetId) {
          target = this.docs.get(targetId);
        }

        if (!target) {
          if (options.upsert) {
            const newDoc = { ...query };
            if (update.$set) Object.assign(newDoc, update.$set);
            const id = targetId || newDoc._id || Math.random().toString();
            this.docs.set(id, newDoc);
            return this._clone(newDoc);
          }
          return null;
        }

        if (update.$set) {
          Object.assign(target, update.$set);
        }
        this.docs.set(targetId, target);
        return this._clone(target);
      })()
    );
  }

  async create(doc) {
    const id = String(doc._id);
    const stored = this._clone(doc);
    stored._id = id;
    this.docs.set(id, stored);
    return stored;
  }

  async deleteOne(query) {
    if (query._id) {
      const deleted = this.docs.delete(String(query._id));
      return { deletedCount: deleted ? 1 : 0 };
    }
    return { deletedCount: 0 };
  }
}

const mockNodes = new GenericInMemoryCollection();
const mockProxies = new GenericInMemoryCollection();
const mockKeys = new GenericInMemoryCollection();
const mockCombos = new GenericInMemoryCollection();

vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn(async () => ({ readyState: 1 })),
  getMongoConfig: vi.fn(() => ({
    uri: "mongodb://127.0.0.1:27017/9router-test",
    maxPoolSize: 5,
  })),
  disconnectDb: vi.fn(async () => {}),
}));

vi.mock("../../src/lib/db/models/ProviderNode.js", () => ({
  ProviderNode: {
    find: (q) => mockNodes.find(q),
    findById: (id) => mockNodes.findById(id),
    findByIdAndUpdate: (id, u, o) => mockNodes.findByIdAndUpdate(id, u, o),
    findOneAndUpdate: (q, u, o) => mockNodes.findOneAndUpdate(q, u, o),
    deleteOne: (q) => mockNodes.deleteOne(q),
  },
}));

vi.mock("../../src/lib/db/models/ProxyPool.js", () => ({
  ProxyPool: {
    find: (q) => mockProxies.find(q),
    findById: (id) => mockProxies.findById(id),
    findByIdAndUpdate: (id, u, o) => mockProxies.findByIdAndUpdate(id, u, o),
    findOneAndUpdate: (q, u, o) => mockProxies.findOneAndUpdate(q, u, o),
    deleteOne: (q) => mockProxies.deleteOne(q),
  },
}));

vi.mock("../../src/lib/db/models/ApiKey.js", () => ({
  ApiKey: {
    find: (q) => mockKeys.find(q),
    findById: (id) => mockKeys.findById(id),
    findOne: (q) => mockKeys.findOne(q),
    findByIdAndUpdate: (id, u, o) => mockKeys.findByIdAndUpdate(id, u, o),
    create: (d) => mockKeys.create(d),
    deleteOne: (q) => mockKeys.deleteOne(q),
  },
}));

vi.mock("../../src/lib/db/models/Combo.js", () => ({
  Combo: {
    find: (q) => mockCombos.find(q),
    findById: (id) => mockCombos.findById(id),
    findOne: (q) => mockCombos.findOne(q),
    findByIdAndUpdate: (id, u, o) => mockCombos.findByIdAndUpdate(id, u, o),
    create: (d) => mockCombos.create(d),
    deleteOne: (q) => mockCombos.deleteOne(q),
  },
}));

vi.mock("@/shared/utils/apiKey", () => ({
  generateApiKeyWithMachine: (machineId) => ({
    key: `9r-${machineId}-${Math.random().toString(36).slice(2, 8)}`,
  }),
}));

describe("Core Domain Repositories: Nodes, Proxies, Keys, Combos (V4)", () => {
  beforeEach(() => {
    mockNodes.clear();
    mockProxies.clear();
    mockKeys.clear();
    mockCombos.clear();
  });

  describe("nodesRepo", () => {
    it("creates, queries, updates and deletes provider nodes", async () => {
      const node = await createProviderNode({
        type: "openai-compatible",
        name: "Local vLLM",
        baseUrl: "http://localhost:8000/v1",
        prefix: "vllm",
      });

      expect(node.id).toBeDefined();
      expect(node.type).toBe("openai-compatible");
      expect(node.name).toBe("Local vLLM");
      expect(node.baseUrl).toBe("http://localhost:8000/v1");

      const fetched = await getProviderNodeById(node.id);
      expect(fetched).toMatchObject({
        type: "openai-compatible",
        name: "Local vLLM",
      });

      const updated = await updateProviderNode(node.id, { name: "vLLM Production" });
      expect(updated.name).toBe("vLLM Production");

      const nodesByType = await getProviderNodes({ type: "openai-compatible" });
      expect(nodesByType).toHaveLength(1);

      const deleted = await deleteProviderNode(node.id);
      expect(deleted.id).toBe(node.id);
      expect(await getProviderNodeById(node.id)).toBeNull();
    });
  });

  describe("proxyPoolsRepo", () => {
    it("creates, queries, updates and deletes proxy pools", async () => {
      const pool = await createProxyPool({
        name: "EU Proxy",
        proxyUrl: "http://proxy.eu.internal:3128",
        isActive: true,
        testStatus: "ok",
      });

      expect(pool.id).toBeDefined();
      expect(pool.name).toBe("EU Proxy");
      expect(pool.isActive).toBe(true);
      expect(pool.testStatus).toBe("ok");

      const fetched = await getProxyPoolById(pool.id);
      expect(fetched.proxyUrl).toBe("http://proxy.eu.internal:3128");

      const updated = await updateProxyPool(pool.id, { testStatus: "error", lastError: "Timeout" });
      expect(updated.testStatus).toBe("error");
      expect(updated.lastError).toBe("Timeout");

      const activePools = await getProxyPools({ isActive: true });
      expect(activePools).toHaveLength(1);

      const deleted = await deleteProxyPool(pool.id);
      expect(deleted.id).toBe(pool.id);
      expect(await getProxyPoolById(pool.id)).toBeNull();
    });
  });

  describe("apiKeysRepo", () => {
    it("creates, lists, updates, validates and deletes API keys", async () => {
      const key = await createApiKey("Dev Key", "machine-abc");
      expect(key.id).toBeDefined();
      expect(key.name).toBe("Dev Key");
      expect(key.machineId).toBe("machine-abc");
      expect(key.key).toContain("9r-machine-abc");
      expect(key.isActive).toBe(true);

      const isValid = await validateApiKey(key.key);
      expect(isValid).toBe(true);

      const invalidValidation = await validateApiKey("unknown-key");
      expect(invalidValidation).toBe(false);

      const byId = await getApiKeyById(key.id);
      expect(byId.name).toBe("Dev Key");

      const updated = await updateApiKey(key.id, { isActive: false });
      expect(updated.isActive).toBe(false);
      expect(await validateApiKey(key.key)).toBe(false);

      const all = await getApiKeys();
      expect(all).toHaveLength(1);

      const deleted = await deleteApiKey(key.id);
      expect(deleted).toBe(true);
      expect(await getApiKeyById(key.id)).toBeNull();
    });

    it("throws error when creating apiKey without machineId", async () => {
      await expect(createApiKey("No Machine", null)).rejects.toThrow("machineId is required");
    });
  });

  describe("combosRepo", () => {
    it("creates, queries, updates and deletes model combos", async () => {
      const combo = await createCombo({
        name: "smart-coder",
        kind: "fallback",
        models: [
          { provider: "anthropic", model: "claude-3-5-sonnet" },
          { provider: "openai", model: "gpt-4o" },
        ],
      });

      expect(combo.id).toBeDefined();
      expect(combo.name).toBe("smart-coder");
      expect(combo.kind).toBe("fallback");
      expect(combo.models).toHaveLength(2);

      const byName = await getComboByName("smart-coder");
      expect(byName.id).toBe(combo.id);

      const byId = await getComboById(combo.id);
      expect(byId.name).toBe("smart-coder");

      const updated = await updateCombo(combo.id, { kind: "round-robin" });
      expect(updated.kind).toBe("round-robin");

      const all = await getCombos();
      expect(all).toHaveLength(1);

      const deleted = await deleteCombo(combo.id);
      expect(deleted).toBe(true);
      expect(await getComboById(combo.id)).toBeNull();
    });
  });
});
