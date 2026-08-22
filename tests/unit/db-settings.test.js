import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getSettings,
  updateSettings,
  isCloudEnabled,
  getCloudUrl,
  exportSettings,
  mergeWithDefaults,
} from "../../src/lib/db/repos/settingsRepo.js";
import {
  getModelAliases,
  setModelAlias,
  deleteModelAlias,
  getCustomModels,
  addCustomModel,
  deleteCustomModel,
  getMitmAlias,
  setMitmAliasAll,
} from "../../src/lib/db/repos/aliasRepo.js";
import {
  getPricing,
  getPricingForModel,
  updatePricing,
  resetPricing,
  resetAllPricing,
} from "../../src/lib/db/repos/pricingRepo.js";
import {
  getDisabledModels,
  getDisabledByProvider,
  disableModels,
  enableModels,
} from "../../src/lib/db/repos/disabledModelsRepo.js";
import { makeKv } from "../../src/lib/db/helpers/kvStore.js";
import { getMeta, setMeta, getMetaSync, setMetaSync } from "../../src/lib/db/helpers/metaStore.js";

// In-memory store simulating MongoDB collections for unit tests
class InMemoryCollection {
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
    return q;
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

  findById(id) {
    return this._makeQuery(
      (async () => {
        const doc = this.docs.get(String(id));
        return doc ? this._clone(doc) : null;
      })()
    );
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

  findOneAndUpdate(query, update, options = {}) {
    return this._makeQuery(
      (async () => {
        let target = null;
        let targetKey = null;

        if (query._id) {
          targetKey = String(query._id);
          target = this.docs.get(targetKey);
        } else {
          for (const [k, doc] of this.docs.entries()) {
            let match = true;
            for (const [qk, qv] of Object.entries(query)) {
              if (doc[qk] !== qv) {
                match = false;
                break;
              }
            }
            if (match) {
              target = doc;
              targetKey = k;
              break;
            }
          }
        }

        if (!target) {
          if (options.upsert) {
            const newDoc = { ...(query._id ? { _id: query._id } : query) };
            if (update.$set) Object.assign(newDoc, update.$set);
            const key = targetKey || newDoc._id || `${newDoc.scope || ""}:${newDoc.key || Math.random()}`;
            this.docs.set(key, newDoc);
            return this._clone(newDoc);
          }
          return null;
        }

        if (update.$set) {
          Object.assign(target, update.$set);
        }
        this.docs.set(targetKey, target);
        return this._clone(target);
      })()
    );
  }

  async create(doc) {
    const id = doc._id || `${doc.scope || ""}:${doc.key || Math.random()}`;
    const stored = this._clone(doc);
    stored._id = id;
    if (this.docs.has(id)) {
      const err = new Error("Duplicate key");
      err.code = 11000;
      throw err;
    }
    this.docs.set(id, stored);
    return stored;
  }

  async deleteOne(query) {
    if (query._id) {
      const deleted = this.docs.delete(String(query._id));
      return { deletedCount: deleted ? 1 : 0 };
    }
    for (const [k, doc] of this.docs.entries()) {
      let match = true;
      for (const [qk, qv] of Object.entries(query)) {
        if (doc[qk] !== qv) {
          match = false;
          break;
        }
      }
      if (match) {
        this.docs.delete(k);
        return { deletedCount: 1 };
      }
    }
    return { deletedCount: 0 };
  }

  async deleteMany(query = {}) {
    let count = 0;
    for (const [k, doc] of this.docs.entries()) {
      let match = true;
      for (const [qk, qv] of Object.entries(query)) {
        if (doc[qk] !== qv) {
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

  async bulkWrite(ops) {
    for (const op of ops) {
      if (op.updateOne) {
        await this.findOneAndUpdate(op.updateOne.filter, op.updateOne.update, {
          upsert: op.updateOne.upsert,
        });
      }
    }
    return { ok: 1 };
  }
}

const mockSettings = new InMemoryCollection();
const mockKv = new InMemoryCollection();
const mockMeta = new InMemoryCollection();

vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn(async () => ({ readyState: 1 })),
  getMongoConfig: vi.fn(() => ({
    uri: "mongodb://127.0.0.1:27017/9router-test",
    maxPoolSize: 5,
  })),
  disconnectDb: vi.fn(async () => {}),
}));

vi.mock("../../src/lib/db/models/Setting.js", () => ({
  Setting: {
    findById: (id) => mockSettings.findById(id),
    findOneAndUpdate: (q, u, o) => mockSettings.findOneAndUpdate(q, u, o),
  },
}));

vi.mock("../../src/lib/db/models/KvEntry.js", () => ({
  KvEntry: {
    findOne: (q) => mockKv.findOne(q),
    find: (q) => mockKv.find(q),
    findOneAndUpdate: (q, u, o) => mockKv.findOneAndUpdate(q, u, o),
    create: (d) => mockKv.create(d),
    deleteOne: (q) => mockKv.deleteOne(q),
    deleteMany: (q) => mockKv.deleteMany(q),
    bulkWrite: (ops) => mockKv.bulkWrite(ops),
  },
}));

vi.mock("../../src/lib/db/models/Meta.js", () => ({
  Meta: {
    findOne: (q) => mockMeta.findOne(q),
    findOneAndUpdate: (q, u, o) => mockMeta.findOneAndUpdate(q, u, o),
  },
}));

describe("Settings & Scoped KV Repositories (V3)", () => {
  beforeEach(() => {
    mockSettings.clear();
    mockKv.clear();
    mockMeta.clear();
  });

  describe("settingsRepo", () => {
    it("returns default settings when database is empty", async () => {
      const s = await getSettings();
      expect(s.cloudEnabled).toBe(false);
      expect(s.requireLogin).toBe(true);
      expect(s.authMode).toBe("password");
      expect(s.stickyRoundRobinLimit).toBe(3);
      expect(s.capacityAdapter.vision.enabled).toBe(true);
    });

    it("atomically merges updates and preserves unmentioned defaults", async () => {
      const updated = await updateSettings({
        cloudEnabled: true,
        cloudUrl: "https://cloud.9router.com",
        tunnelEnabled: true,
      });

      expect(updated.cloudEnabled).toBe(true);
      expect(updated.cloudUrl).toBe("https://cloud.9router.com");
      expect(updated.tunnelEnabled).toBe(true);
      expect(updated.requireLogin).toBe(true);

      const fetched = await getSettings();
      expect(fetched.cloudEnabled).toBe(true);
      expect(fetched.cloudUrl).toBe("https://cloud.9router.com");
      expect(fetched.tunnelEnabled).toBe(true);

      const isCloud = await isCloudEnabled();
      expect(isCloud).toBe(true);

      const cloudUrl = await getCloudUrl();
      expect(cloudUrl).toBe("https://cloud.9router.com");
    });

    it("exports raw settings without defaults pollution", async () => {
      await updateSettings({ customField: "val-123" });
      const raw = await exportSettings();
      expect(raw.customField).toBe("val-123");
      expect(raw.stickyRoundRobinLimit).toBeUndefined();
    });

    it("mergeWithDefaults handles outbound proxy inference", () => {
      const res = mergeWithDefaults({ outboundProxyUrl: "http://proxy.corp:8080" });
      expect(res.outboundProxyEnabled).toBe(true);
      expect(res.outboundProxyUrl).toBe("http://proxy.corp:8080");
    });
  });

  describe("makeKv helper", () => {
    it("supports get, set, setMany, getAll, remove, and clear in isolation by scope", async () => {
      const kvA = makeKv("scopeA");
      const kvB = makeKv("scopeB");

      await kvA.set("k1", { foo: "bar" });
      await kvB.set("k1", { foo: "baz" });

      expect(await kvA.get("k1")).toEqual({ foo: "bar" });
      expect(await kvB.get("k1")).toEqual({ foo: "baz" });

      await kvA.setMany({ k2: 123, k3: true });
      const allA = await kvA.getAll();
      expect(allA).toEqual({
        k1: { foo: "bar" },
        k2: 123,
        k3: true,
      });

      await kvA.remove("k2");
      expect(await kvA.get("k2")).toBeNull();

      await kvA.clear();
      expect(await kvA.getAll()).toEqual({});
      expect(await kvB.get("k1")).toEqual({ foo: "baz" });
    });
  });

  describe("aliasRepo (modelAliases, customModels, mitmAlias)", () => {
    it("manages model aliases", async () => {
      await setModelAlias("gpt-4", "claude-3-5-sonnet");
      await setModelAlias("llama", "deepseek-v3");

      const aliases = await getModelAliases();
      expect(aliases).toEqual({
        "gpt-4": "claude-3-5-sonnet",
        llama: "deepseek-v3",
      });

      await deleteModelAlias("gpt-4");
      const after = await getModelAliases();
      expect(after).toEqual({ llama: "deepseek-v3" });
    });

    it("manages custom models preventing duplicate collisions", async () => {
      const model = {
        providerAlias: "custom-ollama",
        id: "deepseek-r1:8b",
        type: "llm",
        name: "DeepSeek R1 8B",
      };

      const added = await addCustomModel(model);
      expect(added).toBe(true);

      const duplicate = await addCustomModel(model);
      expect(duplicate).toBe(false);

      const all = await getCustomModels();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({
        providerAlias: "custom-ollama",
        id: "deepseek-r1:8b",
        name: "DeepSeek R1 8B",
      });

      await deleteCustomModel(model);
      expect(await getCustomModels()).toHaveLength(0);
    });

    it("manages mitm aliases per tool and batch", async () => {
      await setMitmAliasAll("claude-code", {
        "claude-3-7-sonnet": "deepseek-chat",
      });

      const toolMappings = await getMitmAlias("claude-code");
      expect(toolMappings).toEqual({
        "claude-3-7-sonnet": "deepseek-chat",
      });

      const allMitm = await getMitmAlias();
      expect(allMitm).toEqual({
        "claude-code": { "claude-3-7-sonnet": "deepseek-chat" },
      });
    });
  });

  describe("pricingRepo", () => {
    it("updates, retrieves, and resets model pricing", async () => {
      await updatePricing({
        openai: {
          "gpt-4o": { inputPrice: 2.5, outputPrice: 10.0 },
        },
      });

      const p = await getPricingForModel("openai", "gpt-4o");
      expect(p).toMatchObject({ inputPrice: 2.5, outputPrice: 10.0 });

      await resetPricing("openai", "gpt-4o");
      const afterModelReset = await getPricingForModel("openai", "gpt-4o");
      expect(afterModelReset).not.toEqual({ inputPrice: 2.5, outputPrice: 10.0 });

      await updatePricing({
        anthropic: { "claude-3-5-sonnet": { inputPrice: 3.0, outputPrice: 15.0 } },
      });
      await resetAllPricing();
      const all = await getPricing();
      expect(all).toBeDefined();
    });
  });

  describe("disabledModelsRepo", () => {
    it("disables and re-enables models by provider alias", async () => {
      await disableModels("openai", ["gpt-3.5-turbo", "text-davinci-003"]);
      expect(await getDisabledByProvider("openai")).toEqual([
        "gpt-3.5-turbo",
        "text-davinci-003",
      ]);

      await disableModels("openai", ["gpt-3.5-turbo", "gpt-4-0314"]);
      expect(await getDisabledByProvider("openai")).toEqual([
        "gpt-3.5-turbo",
        "text-davinci-003",
        "gpt-4-0314",
      ]);

      await enableModels("openai", ["text-davinci-003"]);
      expect(await getDisabledByProvider("openai")).toEqual([
        "gpt-3.5-turbo",
        "gpt-4-0314",
      ]);

      const allDisabled = await getDisabledModels();
      expect(allDisabled.openai).toHaveLength(2);

      await enableModels("openai", ["gpt-3.5-turbo", "gpt-4-0314"]);
      expect(await getDisabledByProvider("openai")).toEqual([]);
    });
  });

  describe("metaStore helper", () => {
    it("manages metadata key-values", async () => {
      expect(await getMeta("version", 0)).toBe(0);
      await setMeta("version", 2);
      expect(await getMeta("version")).toBe(2);

      expect(getMetaSync(null, "foo", "def")).toBe("def");
      setMetaSync(null, "foo", "bar"); // No-op safely
    });
  });
});
