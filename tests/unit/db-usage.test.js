import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  statsEmitter,
  trackPendingRequest,
  getActiveRequests,
  saveRequestUsage,
  getUsageHistory,
  getUsageStats,
  getChartData,
  appendRequestLog,
  getRecentLogs,
} from "../../src/lib/db/repos/usageRepo.js";

// In-memory collections simulating UsageHistory, UsageDaily, Meta
class InMemoryUsageHistoryCollection {
  constructor() {
    this.docs = [];
  }
  clear() {
    this.docs = [];
  }
  _clone(d) {
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }
  _makeQuery(promise, isSingle = false) {
    return {
      sort: (sortObj = {}) => {
        const sortedPromise = promise.then((res) => {
          if (isSingle) return res;
          const list = [...res];
          if (sortObj.timestamp === -1) {
            list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          } else if (sortObj.timestamp === 1) {
            list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          }
          return list;
        });
        return {
          limit: (n) => ({
            lean: async () => {
              const arr = await sortedPromise;
              return Array.isArray(arr) ? arr.slice(0, n) : arr;
            },
          }),
          lean: async () => await sortedPromise,
          then: (res, rej) => sortedPromise.then(res, rej),
        };
      },
      limit: (n) => ({
        lean: async () => {
          const arr = await promise;
          return Array.isArray(arr) ? arr.slice(0, n) : arr;
        },
      }),
      lean: async () => await promise,
      then: (res, rej) => promise.then(res, rej),
    };
  }
  async create(doc) {
    const item = { _id: "uh_" + Math.random().toString(36).slice(2, 9), ...this._clone(doc) };
    if (item.timestamp instanceof Date) item.timestamp = item.timestamp.toISOString();
    this.docs.push(item);
    return item;
  }
  findOne(query = {}) {
    const p = (async () => {
      for (const d of [...this.docs].reverse()) {
        let match = true;
        for (const [k, v] of Object.entries(query)) {
          if (k === "timestamp") {
            const dTime = new Date(d.timestamp).getTime();
            const qTime = v instanceof Date ? v.getTime() : new Date(v).getTime();
            if (dTime !== qTime) match = false;
          } else if (d[k] !== v) {
            match = false;
          }
        }
        if (match) return this._clone(d);
      }
      return null;
    })();
    return this._makeQuery(p, true);
  }
  find(query = {}) {
    const p = (async () => {
      let filtered = [...this.docs];
      if (query.provider) filtered = filtered.filter((d) => d.provider === query.provider);
      if (query.model) filtered = filtered.filter((d) => d.model === query.model);
      if (query.timestamp) {
        if (query.timestamp.$gte) filtered = filtered.filter((d) => new Date(d.timestamp) >= new Date(query.timestamp.$gte));
        if (query.timestamp.$lte) filtered = filtered.filter((d) => new Date(d.timestamp) <= new Date(query.timestamp.$lte));
      }
      return filtered.map((d) => this._clone(d));
    })();
    return this._makeQuery(p);
  }
  async updateOne(query, update) {
    const doc = this.docs.find((d) => d._id === query._id);
    if (doc && update.$set) {
      Object.assign(doc, update.$set);
    }
    return { modifiedCount: doc ? 1 : 0 };
  }
}

class InMemoryUsageDailyCollection {
  constructor() {
    this.docs = new Map();
  }
  clear() {
    this.docs.clear();
  }
  _clone(d) {
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }
  _makeQuery(promise) {
    return {
      sort: () => ({
        lean: async () => await promise,
      }),
      lean: async () => await promise,
      then: (res, rej) => promise.then(res, rej),
    };
  }
  find(query = {}) {
    const p = (async () => {
      let list = Array.from(this.docs.values());
      if (query.dateKey && query.dateKey.$gte) {
        list = list.filter((d) => d.dateKey >= query.dateKey.$gte);
      }
      list.sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));
      return list.map((d) => this._clone(d));
    })();
    return this._makeQuery(p);
  }
  async findOneAndUpdate(filter, update, options = {}) {
    const dateKey = filter.dateKey;
    let doc = this.docs.get(dateKey);
    if (!doc && options.upsert) {
      doc = {
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
        byAgentMetadata: {},
      };
      this.docs.set(dateKey, doc);
    }

    if (!doc) return null;

    if (update.$inc) {
      for (const [keyPath, val] of Object.entries(update.$inc)) {
        const parts = keyPath.split(".");
        if (parts.length === 1) {
          doc[parts[0]] = (doc[parts[0]] || 0) + val;
        } else if (parts.length === 3) {
          const [group, subKey, field] = parts;
          if (!doc[group]) doc[group] = {};
          if (!doc[group][subKey]) doc[group][subKey] = {};
          doc[group][subKey][field] = (doc[group][subKey][field] || 0) + val;
        } else if (parts.length === 4) {
          const [group, dim, subKey, field] = parts;
          if (!doc[group]) doc[group] = {};
          if (!doc[group][dim]) doc[group][dim] = {};
          if (!doc[group][dim][subKey]) doc[group][dim][subKey] = {};
          doc[group][dim][subKey][field] = (doc[group][dim][subKey][field] || 0) + val;
        }
      }
    }

    if (update.$set) {
      for (const [keyPath, val] of Object.entries(update.$set)) {
        const parts = keyPath.split(".");
        if (parts.length === 3) {
          const [group, subKey, field] = parts;
          if (!doc[group]) doc[group] = {};
          if (!doc[group][subKey]) doc[group][subKey] = {};
          doc[group][subKey][field] = val;
        } else if (parts.length === 4) {
          const [group, dim, subKey, field] = parts;
          if (!doc[group]) doc[group] = {};
          if (!doc[group][dim]) doc[group][dim] = {};
          if (!doc[group][dim][subKey]) doc[group][dim][subKey] = {};
          doc[group][dim][subKey][field] = val;
        }
      }
    }
    return this._clone(doc);
  }
}

class InMemoryMetaCollection {
  constructor() {
    this.docs = new Map();
  }
  clear() {
    this.docs.clear();
  }
  async findOneAndUpdate(filter, update, options = {}) {
    const key = filter.key;
    let doc = this.docs.get(key);
    if (!doc && options.upsert) {
      doc = { key, value: 0, updatedAt: new Date() };
      this.docs.set(key, doc);
    }
    if (!doc) return null;
    if (update.$inc) {
      doc.value = (doc.value || 0) + (update.$inc.value || 0);
    }
    if (update.$set) {
      Object.assign(doc, update.$set);
    }
    return JSON.parse(JSON.stringify(doc));
  }
}

const mockHistory = new InMemoryUsageHistoryCollection();
const mockDaily = new InMemoryUsageDailyCollection();
const mockMeta = new InMemoryMetaCollection();

vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn(async () => ({})),
}));

vi.mock("../../src/lib/db/models/UsageHistory.js", () => ({
  UsageHistory: {
    create: (d) => mockHistory.create(d),
    findOne: (q) => mockHistory.findOne(q),
    find: (q) => mockHistory.find(q),
    updateOne: (q, u) => mockHistory.updateOne(q, u),
  },
}));

vi.mock("../../src/lib/db/models/UsageDaily.js", () => ({
  UsageDaily: {
    find: (q) => mockDaily.find(q),
    findOneAndUpdate: (f, u, o) => mockDaily.findOneAndUpdate(f, u, o),
  },
}));

vi.mock("../../src/lib/db/models/Meta.js", () => ({
  Meta: {
    findOneAndUpdate: (f, u, o) => mockMeta.findOneAndUpdate(f, u, o),
  },
}));

vi.mock("../../src/lib/db/repos/connectionsRepo.js", () => ({
  getProviderConnections: vi.fn(async () => [
    { id: "conn-1", name: "Primary Claude", provider: "anthropic" },
    { id: "conn-2", name: "GPT Team", provider: "openai" },
  ]),
}));

vi.mock("../../src/lib/db/repos/apiKeysRepo.js", () => ({
  getApiKeys: vi.fn(async () => [
    { id: "k-1", key: "sk-proj-user-1234", name: "Dev Key" },
  ]),
}));

vi.mock("../../src/lib/db/repos/nodesRepo.js", () => ({
  getProviderNodes: vi.fn(async () => []),
}));

vi.mock("../../src/lib/db/repos/pricingRepo.js", () => ({
  getPricingForModel: vi.fn(async () => ({
    prompt: 0.000003,
    completion: 0.000015,
  })),
}));

describe("Usage Repository & Realtime Token Aggregation (V5)", () => {
  beforeEach(() => {
    mockHistory.clear();
    mockDaily.clear();
    mockMeta.clear();
  });

  describe("Pending Requests Tracking", () => {
    it("tracks, increments and decrements pending requests by model and account", async () => {
      trackPendingRequest("claude-3-5-sonnet", "anthropic", "conn-1", true);
      let active = await getActiveRequests();
      expect(active.activeRequests.length).toBe(1);
      expect(active.activeRequests[0].model).toBe("claude-3-5-sonnet");
      expect(active.activeRequests[0].provider).toBe("anthropic");
      expect(active.activeRequests[0].count).toBe(1);

      trackPendingRequest("claude-3-5-sonnet", "anthropic", "conn-1", false);
      active = await getActiveRequests();
      expect(active.activeRequests.length).toBe(0);
    });

    it("records last error provider when request finishes with error", async () => {
      trackPendingRequest("gpt-4o", "openai", "conn-2", false, true);
      const active = await getActiveRequests();
      expect(active.errorProvider).toBe("openai");
    });
  });

  describe("Saving Usage Metrics & Daily $inc Aggregations", () => {
    it("persists request usage in UsageHistory and atomically increments UsageDaily and lifetime Meta", async () => {
      const now = new Date("2026-08-22T14:30:00Z");
      const entry = {
        timestamp: now.toISOString(),
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        connectionId: "conn-1",
        apiKey: "sk-proj-user-1234",
        endpoint: "/v1/chat/completions",
        tokens: {
          prompt_tokens: 100,
          completion_tokens: 50,
          cached_tokens: 20,
        },
        cost: 0.001,
        status: "ok",
      };

      await saveRequestUsage(entry);

      // Verify History record
      const history = await getUsageHistory();
      expect(history.length).toBe(1);
      expect(history[0].provider).toBe("anthropic");
      expect(history[0].model).toBe("claude-3-5-sonnet");
      expect(history[0].apiKeyMasked).toBe("sk-proj-***");

      // Verify Daily $inc entry
      const dateKey = "2026-08-22";
      const dailyDoc = mockDaily.docs.get(dateKey);
      expect(dailyDoc).toBeDefined();
      expect(dailyDoc.requests).toBe(1);
      expect(dailyDoc.promptTokens).toBe(100);
      expect(dailyDoc.completionTokens).toBe(50);
      expect(dailyDoc.byProvider.anthropic.requests).toBe(1);

      // Verify Meta lifetime counter
      expect(mockMeta.docs.get("totalRequestsLifetime").value).toBe(1);
    });
    it("records agentMetadata in UsageHistory and atomically increments byAgentMetadata in UsageDaily", async () => {
      const entry = {
        timestamp: "2026-08-22T15:00:00Z",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        tokens: { prompt_tokens: 150, completion_tokens: 75, cached_tokens: 25 },
        cost: 0.0015,
        agentMetadata: {
          os: "linux",
          "agent-name": "pi",
          hostname: "worker-node-1",
        },
      };

      await saveRequestUsage(entry);

      const history = await getUsageHistory();
      expect(history.length).toBe(1);

      const dailyDoc = mockDaily.docs.get("2026-08-22");
      expect(dailyDoc.byAgentMetadata).toBeDefined();
      expect(dailyDoc.byAgentMetadata.os.linux.requests).toBe(1);
      expect(dailyDoc.byAgentMetadata.os.linux.promptTokens).toBe(150);
      expect(dailyDoc.byAgentMetadata.os.linux.completionTokens).toBe(75);
      expect(dailyDoc.byAgentMetadata["agent-name"].pi.requests).toBe(1);
      expect(dailyDoc.byAgentMetadata.hostname["worker-node-1"].requests).toBe(1);
    });


    it("prevents duplicate usage records on exact duplicate replay", async () => {
      const entry = {
        timestamp: "2026-08-22T12:00:00Z",
        provider: "openai",
        model: "gpt-4o",
        tokens: { prompt_tokens: 50, completion_tokens: 20 },
      };

      await saveRequestUsage(entry);
      await saveRequestUsage(entry);

      const history = await getUsageHistory();
      expect(history.length).toBe(1);
      expect(mockDaily.docs.get("2026-08-22").requests).toBe(1);
    });
  });

  describe("Usage Stats and Chart Data Aggregation", () => {
    beforeEach(async () => {
      const entries = [
        {
          timestamp: "2026-08-22T10:00:00Z",
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          connectionId: "conn-1",
          tokens: { prompt_tokens: 200, completion_tokens: 100 },
          cost: 0.002,
        },
        {
          timestamp: "2026-08-22T11:00:00Z",
          provider: "openai",
          model: "gpt-4o",
          connectionId: "conn-2",
          tokens: { prompt_tokens: 300, completion_tokens: 150 },
          cost: 0.003,
        },
      ];
      for (const e of entries) {
        await saveRequestUsage(e);
      }
    });

    it("calculates consolidated usage stats across providers and models", async () => {
      const stats = await getUsageStats("all");
      expect(stats.totalPromptTokens).toBe(500);
      expect(stats.totalCompletionTokens).toBe(250);
      expect(stats.totalRequests).toBe(2);
      expect(stats.byProvider.anthropic.requests).toBe(1);
      expect(stats.byProvider.openai.requests).toBe(1);
    });

    it("aggregates byAgentMetadata across daily summaries and recent history in getUsageStats", async () => {
      const entryWithMeta = {
        timestamp: "2026-08-22T12:00:00Z",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        tokens: { prompt_tokens: 100, completion_tokens: 50 },
        cost: 0.001,
        agentMetadata: {
          "agent-name": "pi",
          os: "darwin",
        },
      };
      await saveRequestUsage(entryWithMeta);

      const statsAll = await getUsageStats("all");
      expect(statsAll.byAgentMetadata).toBeDefined();
      expect(statsAll.byAgentMetadata["agent-name"]).toBeDefined();
      expect(statsAll.byAgentMetadata["agent-name"].pi.requests).toBe(1);
      expect(statsAll.byAgentMetadata["agent-name"].pi.promptTokens).toBe(100);
      expect(statsAll.byAgentMetadata.os.darwin.requests).toBe(1);

      // Also test 24h / today live history aggregation
      const statsToday = await getUsageStats("24h");
      expect(statsToday.byAgentMetadata).toBeDefined();
      expect(statsToday.byAgentMetadata["agent-name"].pi.requests).toBe(1);
    });

    it("returns bucketed series chart data", async () => {
      const chart = await getChartData("7d");
      expect(chart).toBeInstanceOf(Array);
      expect(chart.length).toBe(7);
      const todayBucket = chart[chart.length - 1];
      expect(todayBucket.tokens).toBe(750);
      expect(todayBucket.inputTokens).toBe(500);
    });

    it("retrieves formatted recent logs from live usage history", async () => {
      const logs = await getRecentLogs(10);
      expect(logs.length).toBe(2);
      expect(logs[0]).toContain("OPENAI");
      expect(logs[1]).toContain("ANTHROPIC");
    });
  });
});
