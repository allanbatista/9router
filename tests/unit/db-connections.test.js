import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getProviderConnections,
  getProviderConnectionById,
  createProviderConnection,
  updateProviderConnection,
  deleteProviderConnection,
  deleteProviderConnectionsByProvider,
  reorderProviderConnections,
  cleanupProviderConnections,
} from "../../src/lib/db/repos/connectionsRepo.js";

// In-memory store simulating MongoDB collection for ProviderConnection
class InMemoryProviderConnectionCollection {
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

  async deleteMany(query = {}) {
    let count = 0;
    for (const [id, doc] of this.docs.entries()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) {
        this.docs.delete(id);
        count++;
      }
    }
    return { deletedCount: count };
  }

  async bulkWrite(ops) {
    for (const op of ops) {
      if (op.updateOne) {
        const id = String(op.updateOne.filter._id);
        const target = this.docs.get(id);
        if (target && op.updateOne.update.$set) {
          Object.assign(target, op.updateOne.update.$set);
          this.docs.set(id, target);
        }
      }
    }
    return { ok: 1 };
  }
}

const mockConnStore = new InMemoryProviderConnectionCollection();

vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn(async () => ({ readyState: 1 })),
  getMongoConfig: vi.fn(() => ({
    uri: "mongodb://127.0.0.1:27017/9router-test",
    maxPoolSize: 5,
  })),
  disconnectDb: vi.fn(async () => {}),
}));

vi.mock("../../src/lib/db/models/ProviderConnection.js", () => ({
  ProviderConnection: {
    find: (q) => mockConnStore.find(q),
    findById: (id) => mockConnStore.findById(id),
    findByIdAndUpdate: (id, u, o) => mockConnStore.findByIdAndUpdate(id, u, o),
    create: (d) => mockConnStore.create(d),
    deleteOne: (q) => mockConnStore.deleteOne(q),
    deleteMany: (q) => mockConnStore.deleteMany(q),
    bulkWrite: (ops) => mockConnStore.bulkWrite(ops),
  },
}));

describe("Provider Connections Repository (V4)", () => {
  beforeEach(() => {
    mockConnStore.clear();
  });

  it("creates a provider connection and derives priority", async () => {
    const conn1 = await createProviderConnection({
      provider: "anthropic",
      authType: "oauth",
      email: "user1@example.com",
      accessToken: "token-1",
      refreshToken: "refresh-1",
    });

    expect(conn1.id).toBeDefined();
    expect(conn1.provider).toBe("anthropic");
    expect(conn1.authType).toBe("oauth");
    expect(conn1.email).toBe("user1@example.com");
    expect(conn1.priority).toBe(1);
    expect(conn1.accessToken).toBe("token-1");

    const conn2 = await createProviderConnection({
      provider: "anthropic",
      authType: "oauth",
      email: "user2@example.com",
      accessToken: "token-2",
    });

    expect(conn2.priority).toBe(2);

    const all = await getProviderConnections({ provider: "anthropic" });
    expect(all).toHaveLength(2);
    expect(all[0].priority).toBe(1);
    expect(all[1].priority).toBe(2);
  });

  it("updates connection atomically on OAuth token refresh without losing metadata", async () => {
    const conn = await createProviderConnection({
      provider: "openai",
      authType: "oauth",
      email: "alex@example.com",
      accessToken: "old-token",
      refreshToken: "old-refresh",
      expiresAt: 1000,
      scope: "read write",
    });

    const updated = await updateProviderConnection(conn.id, {
      accessToken: "new-token",
      refreshToken: "new-refresh",
      expiresAt: 2000,
    });

    expect(updated.id).toBe(conn.id);
    expect(updated.accessToken).toBe("new-token");
    expect(updated.refreshToken).toBe("new-refresh");
    expect(updated.expiresAt).toBe(2000);
    expect(updated.scope).toBe("read write");
    expect(updated.email).toBe("alex@example.com");

    const fetched = await getProviderConnectionById(conn.id);
    expect(fetched.accessToken).toBe("new-token");
    expect(fetched.scope).toBe("read write");
  });

  it("deduplicates OAuth login for same email and updates in place", async () => {
    const initial = await createProviderConnection({
      provider: "google",
      authType: "oauth",
      email: "dev@company.com",
      accessToken: "tok-1",
    });

    const second = await createProviderConnection({
      provider: "google",
      authType: "oauth",
      email: "dev@company.com",
      accessToken: "tok-2-renewed",
    });

    expect(second.id).toBe(initial.id);
    expect(second.accessToken).toBe("tok-2-renewed");

    const all = await getProviderConnections({ provider: "google" });
    expect(all).toHaveLength(1);
  });

  it("filters connections by provider and isActive", async () => {
    await createProviderConnection({
      provider: "openai",
      authType: "apikey",
      name: "Key 1",
      apiKey: "sk-1",
      isActive: true,
    });
    await createProviderConnection({
      provider: "openai",
      authType: "apikey",
      name: "Key 2",
      apiKey: "sk-2",
      isActive: false,
    });
    await createProviderConnection({
      provider: "anthropic",
      authType: "apikey",
      name: "Key 3",
      apiKey: "sk-3",
      isActive: true,
    });

    const activeOpenAI = await getProviderConnections({ provider: "openai", isActive: true });
    expect(activeOpenAI).toHaveLength(1);
    expect(activeOpenAI[0].name).toBe("Key 1");

    const allOpenAI = await getProviderConnections({ provider: "openai" });
    expect(allOpenAI).toHaveLength(2);
  });

  it("deletes a single connection and reorders remaining connections", async () => {
    const c1 = await createProviderConnection({ provider: "mistral", authType: "apikey", name: "K1" });
    const c2 = await createProviderConnection({ provider: "mistral", authType: "apikey", name: "K2" });
    const c3 = await createProviderConnection({ provider: "mistral", authType: "apikey", name: "K3" });

    const deleted = await deleteProviderConnection(c2.id);
    expect(deleted).toBe(true);

    const remaining = await getProviderConnections({ provider: "mistral" });
    expect(remaining).toHaveLength(2);
    expect(remaining.map((c) => c.name)).toEqual(["K1", "K3"]);
    expect(remaining[0].priority).toBe(1);
    expect(remaining[1].priority).toBe(2);
  });

  it("deletes all connections for a provider", async () => {
    await createProviderConnection({ provider: "groq", authType: "apikey", name: "G1" });
    await createProviderConnection({ provider: "groq", authType: "apikey", name: "G2" });
    await createProviderConnection({ provider: "cerebras", authType: "apikey", name: "C1" });

    const count = await deleteProviderConnectionsByProvider("groq");
    expect(count).toBe(2);

    expect(await getProviderConnections({ provider: "groq" })).toHaveLength(0);
    expect(await getProviderConnections({ provider: "cerebras" })).toHaveLength(1);
  });

  it("cleans up null or empty attributes across connections", async () => {
    const c = await createProviderConnection({
      provider: "xai",
      authType: "apikey",
      name: "X1",
      lastError: null,
      errorCode: undefined,
      providerSpecificData: {},
    });

    const cleanedCount = await cleanupProviderConnections();
    expect(cleanedCount).toBeGreaterThanOrEqual(0);

    const fetched = await getProviderConnectionById(c.id);
    expect(fetched.lastError).toBeUndefined();
    expect(fetched.providerSpecificData).toBeUndefined();
  });
});
