import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getAffinity,
  setAffinity,
  touchAffinity,
  pruneExpired,
  hashCacheKey,
  normalizeCacheKey,
  consistentIndex,
} from "../../src/lib/db/repos/sessionAffinityRepo.js";
import {
  getComboAffinity,
  setComboAffinity,
  touchComboAffinity,
  pruneComboExpired,
} from "../../src/lib/db/repos/comboAffinityRepo.js";

// In-memory collection simulator for SessionAffinity and ComboAffinity
class InMemoryAffinityCollection {
  constructor(uniqueKeys = []) {
    this.uniqueKeys = uniqueKeys;
    this.docs = new Map();
  }

  clear() {
    this.docs.clear();
  }

  _getKey(query) {
    return this.uniqueKeys.map((k) => String(query[k] ?? "")).join("::");
  }

  _clone(doc) {
    if (!doc) return null;
    return JSON.parse(JSON.stringify(doc));
  }

  _makeQuery(promise) {
    return {
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: async () => await promise,
          }),
          lean: async () => await promise,
        }),
        lean: async () => await promise,
      }),
      limit: (n) => ({
        select: () => ({
          lean: async () => (await promise).slice(0, n),
        }),
        lean: async () => (await promise).slice(0, n),
      }),
      lean: async () => await promise,
      then: (resolve, reject) => promise.then(resolve, reject),
    };
  }

  findOne(query = {}) {
    const p = (async () => {
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
    })();
    return this._makeQuery(p);
  }

  find(query = {}) {
    const p = (async () => {
      const results = [];
      for (const doc of this.docs.values()) {
        let match = true;
        for (const [k, v] of Object.entries(query)) {
          if (v && typeof v === "object" && v.$lt) {
            if (!(new Date(doc[k]) < new Date(v.$lt))) {
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
    })();
    return this._makeQuery(p);
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const key = this._getKey(filter);
    let doc = this.docs.get(key);

    if (!doc && options.upsert) {
      doc = {
        _id: "id_" + Math.random().toString(36).slice(2, 9),
        ...(options.setDefaultsOnInsert ? (update.$setOnInsert || {}) : {}),
        hitCount: 0,
      };
      this.docs.set(key, doc);
    }

    if (!doc) return null;

    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) {
        doc[k] = v instanceof Date ? v.toISOString() : v;
      }
    }

    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + v;
      }
    }

    return this._clone(doc);
  }

  async updateOne(filter, update) {
    const key = this._getKey(filter);
    const doc = this.docs.get(key);
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };

    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) {
        doc[k] = v instanceof Date ? v.toISOString() : v;
      }
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + v;
      }
    }

    return { matchedCount: 1, modifiedCount: 1 };
  }

  async deleteOne(query) {
    for (const [key, doc] of this.docs.entries()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) {
        this.docs.delete(key);
        return { deletedCount: 1 };
      }
    }
    return { deletedCount: 0 };
  }

  async deleteMany(query = {}) {
    let count = 0;
    for (const [key, doc] of Array.from(this.docs.entries())) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (k === "_id" && v && v.$in) {
          if (!v.$in.includes(doc._id)) match = false;
        } else if (v && typeof v === "object" && v.$lt) {
          if (!(new Date(doc[k]) < new Date(v.$lt))) match = false;
        } else if (doc[k] !== v) {
          match = false;
        }
      }
      if (match) {
        this.docs.delete(key);
        count++;
      }
    }
    return { deletedCount: count };
  }

  async countDocuments() {
    return this.docs.size;
  }
}

const mockSessionAffinity = new InMemoryAffinityCollection(["provider", "model", "cacheKeyHash"]);
const mockComboAffinity = new InMemoryAffinityCollection(["comboName", "cacheKeyHash"]);

vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn(async () => ({})),
}));

vi.mock("../../src/lib/db/models/SessionAffinity.js", () => ({
  SessionAffinity: {
    findOne: (q) => mockSessionAffinity.findOne(q),
    find: (q) => mockSessionAffinity.find(q),
    findOneAndUpdate: (f, u, o) => mockSessionAffinity.findOneAndUpdate(f, u, o),
    updateOne: (f, u) => mockSessionAffinity.updateOne(f, u),
    deleteOne: (q) => mockSessionAffinity.deleteOne(q),
    deleteMany: (q) => mockSessionAffinity.deleteMany(q),
    countDocuments: () => mockSessionAffinity.countDocuments(),
  },
}));

vi.mock("../../src/lib/db/models/ComboAffinity.js", () => ({
  ComboAffinity: {
    findOne: (q) => mockComboAffinity.findOne(q),
    find: (q) => mockComboAffinity.find(q),
    findOneAndUpdate: (f, u, o) => mockComboAffinity.findOneAndUpdate(f, u, o),
    updateOne: (f, u) => mockComboAffinity.updateOne(f, u),
    deleteOne: (q) => mockComboAffinity.deleteOne(q),
    deleteMany: (q) => mockComboAffinity.deleteMany(q),
    countDocuments: () => mockComboAffinity.countDocuments(),
  },
}));

describe("Session & Combo Affinity Repositories (V7)", () => {
  beforeEach(() => {
    mockSessionAffinity.clear();
    mockComboAffinity.clear();
  });

  describe("Cache Key and Hashing Helpers", () => {
    it("generates 16-char hex sha256 hash for cache key", () => {
      const h1 = hashCacheKey("user-session-1234");
      expect(h1).toHaveLength(16);
      expect(h1).toMatch(/^[0-9a-f]{16}$/);

      expect(hashCacheKey("")).toBeNull();
      expect(hashCacheKey(null)).toBeNull();
      expect(hashCacheKey("   ")).toBeNull();
    });

    it("normalizes cache key for general and special providers", () => {
      expect(normalizeCacheKey("  valid-key  ", "openai")).toBe("valid-key");
      expect(normalizeCacheKey(null, "openai")).toBeNull();
      expect(normalizeCacheKey("a".repeat(300), "openai")).toBeNull();

      // Special provider normalization (antigravity / gemini-cli)
      const numKey = normalizeCacheKey("-987654", "antigravity");
      expect(numKey).toBe("-987654");

      const stringKey = normalizeCacheKey("prompt-cache-identifier", "antigravity");
      expect(stringKey).toMatch(/^-\d+$/);
    });

    it("computes consistent index deterministically across hashes", () => {
      const hash = "1a2b3c4d5e6f7a8b";
      const idx1 = consistentIndex(hash, 5);
      const idx2 = consistentIndex(hash, 5);
      expect(idx1).toBe(idx2);
      expect(idx1).toBeGreaterThanOrEqual(0);
      expect(idx1).toBeLessThan(5);

      expect(consistentIndex(null, 5)).toBe(0);
      expect(consistentIndex(hash, 0)).toBe(0);
    });
  });

  describe("Session Affinity (sessionAffinityRepo)", () => {
    it("sets, gets and increments hitCount on session affinity", () => {
      return (async () => {
        const hash = hashCacheKey("session-1");
        await setAffinity("anthropic", "claude-3-5-sonnet", hash, "raw-session-1", "conn-1");

        const record = await getAffinity("anthropic", "claude-3-5-sonnet", hash);
        expect(record).not.toBeNull();
        expect(record.provider).toBe("anthropic");
        expect(record.model).toBe("claude-3-5-sonnet");
        expect(record.cacheKeyHash).toBe(hash);
        expect(record.connectionId).toBe("conn-1");
        expect(record.hitCount).toBe(1);

        // Update connection or re-set
        await setAffinity("anthropic", "claude-3-5-sonnet", hash, "raw-session-1", "conn-2");
        const updated = await getAffinity("anthropic", "claude-3-5-sonnet", hash);
        expect(updated.connectionId).toBe("conn-2");
        expect(updated.hitCount).toBe(2);
      })();
    });

    it("touches session affinity timestamp and hitCount", async () => {
      const hash = hashCacheKey("session-touch");
      await setAffinity("openai", "gpt-4o", hash, "raw-touch", "conn-openai-1");

      await touchAffinity("openai", "gpt-4o", hash);
      const doc = await getAffinity("openai", "gpt-4o", hash);
      expect(doc.hitCount).toBe(2);
    });

    it("handles getAffinity for non-existent and invalid inputs", async () => {
      expect(await getAffinity(null, "gpt-4o", "hash")).toBeNull();
      expect(await getAffinity("openai", null, "hash")).toBeNull();
      expect(await getAffinity("openai", "gpt-4o", null)).toBeNull();
      expect(await getAffinity("openai", "gpt-4o", "non-existent-hash")).toBeNull();
    });

    it("prunes expired entries older than TTL", async () => {
      const hash1 = hashCacheKey("active");
      const hash2 = hashCacheKey("old");

      await setAffinity("openai", "gpt-4o", hash1, "active", "conn-1");
      await setAffinity("openai", "gpt-4o", hash2, "old", "conn-2");

      // Manually backdate hash2 in mock
      const key2 = mockSessionAffinity._getKey({ provider: "openai", model: "gpt-4o", cacheKeyHash: hash2 });
      mockSessionAffinity.docs.get(key2).updatedAt = new Date(Date.now() - 40 * 60 * 1000).toISOString();

      await pruneExpired();

      expect(await getAffinity("openai", "gpt-4o", hash1)).not.toBeNull();
      expect(await getAffinity("openai", "gpt-4o", hash2)).toBeNull();
    });
  });

  describe("Combo Affinity (comboAffinityRepo)", () => {
    it("sets, gets and touches combo affinity", async () => {
      const hash = hashCacheKey("combo-req-1");
      await setComboAffinity("coding-combo", hash, "raw-combo", "claude-3-7-sonnet");

      const record = await getComboAffinity("coding-combo", hash);
      expect(record).not.toBeNull();
      expect(record.comboName).toBe("coding-combo");
      expect(record.cacheKeyHash).toBe(hash);
      expect(record.selectedModel).toBe("claude-3-7-sonnet");
      expect(record.hitCount).toBe(1);

      await touchComboAffinity("coding-combo", hash);
      const touched = await getComboAffinity("coding-combo", hash);
      expect(touched.hitCount).toBe(2);
    });

    it("handles combo affinity non-existent and invalid inputs", async () => {
      expect(await getComboAffinity(null, "hash")).toBeNull();
      expect(await getComboAffinity("combo", null)).toBeNull();
      expect(await getComboAffinity("non-existent-combo", "hash")).toBeNull();
    });

    it("prunes expired combo affinity records", async () => {
      const hash1 = hashCacheKey("combo-active");
      const hash2 = hashCacheKey("combo-old");

      await setComboAffinity("test-combo", hash1, "active", "model-a");
      await setComboAffinity("test-combo", hash2, "old", "model-b");

      const key2 = mockComboAffinity._getKey({ comboName: "test-combo", cacheKeyHash: hash2 });
      mockComboAffinity.docs.get(key2).updatedAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();

      await pruneComboExpired();

      expect(await getComboAffinity("test-combo", hash1)).not.toBeNull();
      expect(await getComboAffinity("test-combo", hash2)).toBeNull();
    });
  });
});
