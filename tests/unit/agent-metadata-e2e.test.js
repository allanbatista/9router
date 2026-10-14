import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalizeAgentMetadata } from "../../open-sse/utils/agentMetadata.js";
import { buildRequestDetail } from "../../open-sse/handlers/chatCore/requestDetail.js";
import { saveRequestDetail, flushToDatabase, getRequestDetails, getDistinctMetadataValues } from "../../src/lib/db/repos/requestDetailsRepo.js";
import { saveRequestUsage, getUsageStats, getUsageHistory } from "../../src/lib/db/repos/usageRepo.js";
import { updateSettings, getSettings } from "../../src/lib/db/repos/settingsRepo.js";
import { GET as getRequestDetailsRoute } from "../../src/app/api/usage/request-details/route.js";
import { GET as getMetadataValuesRoute } from "../../src/app/api/usage/metadata-values/route.js";
import { GET as getStatsRoute } from "../../src/app/api/usage/stats/route.js";
import { PATCH as patchSettingsRoute } from "../../src/app/api/settings/route.js";

// In-memory collections for e2e isolation
class InMemoryHistory {
  constructor() { this.docs = []; }
  clear() { this.docs = []; }
  async create(doc) {
    const item = { _id: "hist_" + Math.random().toString(36).slice(2, 9), ...JSON.parse(JSON.stringify(doc)) };
    if (item.timestamp instanceof Date) item.timestamp = item.timestamp.toISOString();
    this.docs.push(item);
    return item;
  }
  findOne(query = {}) {
    return {
      sort: () => ({
        lean: async () => {
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
            if (match) return JSON.parse(JSON.stringify(d));
          }
          return null;
        }
      })
    };
  }
  find(query = {}) {
    const list = [...this.docs].filter((d) => {
      if (query.timestamp?.$gte && new Date(d.timestamp) < new Date(query.timestamp.$gte)) return false;
      if (query.timestamp?.$lte && new Date(d.timestamp) > new Date(query.timestamp.$lte)) return false;
      if (query.provider && d.provider !== query.provider) return false;
      if (query.model && d.model !== query.model) return false;
      return true;
    });
    return {
      sort: () => ({
        limit: (n) => ({
          lean: async () => list.slice(0, n).map(d => JSON.parse(JSON.stringify(d)))
        }),
        lean: async () => list.map(d => JSON.parse(JSON.stringify(d)))
      }),
      lean: async () => list.map(d => JSON.parse(JSON.stringify(d)))
    };
  }
}

class InMemoryDaily {
  constructor() { this.docs = new Map(); }
  clear() { this.docs.clear(); }
  find(query = {}) {
    let list = Array.from(this.docs.values());
    if (query.dateKey?.$gte) {
      list = list.filter((d) => d.dateKey >= query.dateKey.$gte);
    }
    list.sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));
    return {
      sort: () => ({
        lean: async () => list.map((d) => JSON.parse(JSON.stringify(d)))
      }),
      lean: async () => list.map((d) => JSON.parse(JSON.stringify(d)))
    };
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
    return JSON.parse(JSON.stringify(doc));
  }
}

class InMemoryRequestDetailCollection {
  constructor() { this.docs = []; }
  clear() { this.docs = []; }
  async countDocuments(query = {}) {
    return this._filter(query).length;
  }
  async bulkWrite(ops) {
    for (const op of ops) {
      if (op.updateOne) {
        this.docs.push({ _id: "rd_" + Math.random().toString(36).slice(2, 9), ...op.updateOne.update.$set });
      }
    }
    return { insertedCount: ops.length };
  }
  _filter(query = {}) {
    return this.docs.filter((d) => {
      for (const [k, v] of Object.entries(query)) {
        if (k.startsWith("agentMetadata.")) {
          const subKey = k.slice("agentMetadata.".length);
          if (v && typeof v === "object" && "$ne" in v) {
            if (d.agentMetadata?.[subKey] == null) return false;
          } else if (d.agentMetadata?.[subKey] !== v) {
            return false;
          }
        } else if (k === "provider" && d.provider !== v) {
          return false;
        } else if (k === "model" && d.model !== v) {
          return false;
        }
      }
      return true;
    });
  }
  find(query = {}) {
    const list = this._filter(query);
    return {
      sort: () => ({
        skip: (s) => ({
          limit: (l) => ({
            lean: async () => list.slice(s, s + l).map(d => JSON.parse(JSON.stringify(d)))
          })
        }),
        lean: async () => list.map(d => JSON.parse(JSON.stringify(d)))
      }),
      lean: async () => list.map(d => JSON.parse(JSON.stringify(d)))
    };
  }
  async distinct(field, query = {}) {
    const list = this._filter(query);
    const subKey = field.replace("agentMetadata.", "");
    const set = new Set();
    for (const d of list) {
      const val = d.agentMetadata?.[subKey];
      if (val !== undefined && val !== null) set.add(val);
    }
    return Array.from(set);
  }
}

const mockHistory = new InMemoryHistory();
const mockDaily = new InMemoryDaily();
const mockDetails = new InMemoryRequestDetailCollection();

let globalSettingData = {
  enableObservability: true,
  observabilityMaxRecords: 1000,
  observabilityBatchSize: 1,
  observabilityFlushIntervalMs: 10,
  agentMetadataKeys: ["os", "hostname", "agent-name"],
};

vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn(async () => ({})),
}));

vi.mock("../../src/lib/db/models/UsageHistory.js", () => ({
  UsageHistory: {
    create: (d) => mockHistory.create(d),
    findOne: (q) => mockHistory.findOne(q),
    find: (q) => mockHistory.find(q),
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
  },
}));

vi.mock("../../src/lib/db/models/UsageDaily.js", () => ({
  UsageDaily: {
    findOneAndUpdate: (f, u, o) => mockDaily.findOneAndUpdate(f, u, o),
    find: (q) => mockDaily.find(q),
  },
}));

vi.mock("../../src/lib/db/models/RequestDetail.js", () => ({
  RequestDetail: {
    countDocuments: (q) => mockDetails.countDocuments(q),
    find: (q) => mockDetails.find(q),
    distinct: (f, q) => mockDetails.distinct(f, q),
    bulkWrite: (ops) => mockDetails.bulkWrite(ops),
    deleteMany: () => Promise.resolve({ deletedCount: 0 }),
  },
}));

vi.mock("../../src/lib/db/models/Setting.js", () => ({
  Setting: {
    findById: (_id) => ({
      lean: async () => ({
        _id: "global",
        data: JSON.parse(JSON.stringify(globalSettingData)),
      }),
    }),
    findOneAndUpdate: (_filter, update, _opts) => {
      if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) {
          if (k.startsWith("data.")) {
            globalSettingData[k.slice(5)] = v;
          } else if (k === "data") {
            globalSettingData = { ...globalSettingData, ...v };
          }
        }
      }
      const res = { _id: "global", data: { ...globalSettingData } };
      return {
        lean: async () => JSON.parse(JSON.stringify(res)),
      };
    },
    findOne: () => ({
      lean: async () => ({
        _id: "global",
        data: JSON.parse(JSON.stringify(globalSettingData)),
      }),
    }),
  },
}));

vi.mock("../../src/lib/db/models/Meta.js", () => ({
  Meta: {
    findOneAndUpdate: () => Promise.resolve({ value: 1 }),
  },
}));

vi.mock("../../src/lib/db/repos/connectionsRepo.js", () => ({
  getProviderConnections: vi.fn(async () => []),
}));

vi.mock("../../src/lib/db/repos/apiKeysRepo.js", () => ({
  getApiKeys: vi.fn(async () => []),
}));

vi.mock("../../src/lib/db/repos/nodesRepo.js", () => ({
  getProviderNodes: vi.fn(async () => []),
}));

vi.mock("../../src/lib/db/repos/pricingRepo.js", () => ({
  getPricingForModel: vi.fn(async () => null),
}));

describe("Agent Metadata End-to-End Flow", () => {
  beforeEach(() => {
    mockHistory.clear();
    mockDaily.clear();
    mockDetails.clear();
    globalSettingData = {
      enableObservability: true,
      observabilityMaxRecords: 1000,
      observabilityBatchSize: 1,
      observabilityFlushIntervalMs: 10,
      agentMetadataKeys: ["os", "hostname", "agent-name"],
    };
  });

  it("completes the full flow: settings configuration -> ingestion -> MongoDB indexing -> filtered requests query -> atomic usage daily aggregation", async () => {
    // 1. Settings configuration: Add "client-mode" to agentMetadataKeys
    const patchReq = new Request("http://localhost:20127/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentMetadataKeys: ["os", "hostname", "agent-name", "client-mode"] }),
    });
    const patchRes = await patchSettingsRoute(patchReq);
    expect(patchRes.status).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.agentMetadataKeys).toEqual(["os", "hostname", "agent-name", "client-mode"]);

    // 2. Ingestion pipeline: incoming request with _agent_metadata array
    const rawClientPayload = {
      messages: [{ role: "user", content: "What is the weather?" }],
      _agent_metadata: [
        { key: "os", value: "linux" },
        { key: "hostname", value: "workstation-alpha" },
        { key: "agent-name", value: "pi" },
        { key: "client-mode", value: "code-assist" },
      ],
    };

    const normMeta = normalizeAgentMetadata(rawClientPayload._agent_metadata);
    expect(normMeta).toEqual({
      os: "linux",
      hostname: "workstation-alpha",
      "agent-name": "pi",
      "client-mode": "code-assist",
    });

    const requestDetailPayload = buildRequestDetail({
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      tokens: { prompt_tokens: 120, completion_tokens: 60, cached_tokens: 20 },
      request: rawClientPayload,
      status: "success",
    });

    expect(requestDetailPayload.agentMetadata).toEqual(normMeta);

    // Save request detail (observability)
    await saveRequestDetail(requestDetailPayload);
    await flushToDatabase();

    // Save request usage (metrics & aggregation)
    await saveRequestUsage({
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      tokens: { prompt_tokens: 120, completion_tokens: 60, cached_tokens: 20 },
      agentMetadata: normMeta,
      timestamp: "2026-08-22T16:00:00Z",
    });

    // Ingest a second request with different metadata
    const secondMeta = normalizeAgentMetadata({
      os: "darwin",
      hostname: "macbook-pro",
      "agent-name": "claude",
    });

    const secondDetail = buildRequestDetail({
      provider: "openai",
      model: "gpt-4o",
      tokens: { prompt_tokens: 80, completion_tokens: 40 },
      request: { messages: [{ role: "user", content: "Hello" }], _agent_metadata: secondMeta },
      status: "success",
    });
    await saveRequestDetail(secondDetail);
    await flushToDatabase();

    await saveRequestUsage({
      provider: "openai",
      model: "gpt-4o",
      tokens: { prompt_tokens: 80, completion_tokens: 40 },
      agentMetadata: secondMeta,
      timestamp: "2026-08-22T16:05:00Z",
    });

    // 3. Request Details query filtering by agentMetadata[agent-name]=pi
    const filteredQueryReq = new Request("http://localhost:20127/api/usage/request-details?page=1&pageSize=20&agentMetadata[agent-name]=pi");
    const filteredRes = await getRequestDetailsRoute(filteredQueryReq);
    expect(filteredRes.status).toBe(200);
    const filteredJson = await filteredRes.json();
    expect(filteredJson.details.length).toBe(1);
    expect(filteredJson.details[0].agentMetadata["agent-name"]).toBe("pi");
    expect(filteredJson.details[0].agentMetadata.os).toBe("linux");
    expect(filteredJson.details[0].request).toEqual({ redacted: true });
    const distinctReq = new Request("http://localhost:20127/api/usage/metadata-values?key=agent-name");
    const distinctRes = await getMetadataValuesRoute(distinctReq);
    expect(distinctRes.status).toBe(200);
    const distinctJson = await distinctRes.json();
    expect(distinctJson.key).toBe("agent-name");
    expect(distinctJson.values).toContain("pi");
    expect(distinctJson.values).toContain("claude");

    // 5. Usage Stats API with byAgentMetadata dimension aggregations
    const statsReq = new Request("http://localhost:20127/api/usage/stats?period=all");
    const statsRes = await getStatsRoute(statsReq);
    expect(statsRes.status).toBe(200);
    const statsJson = await statsRes.json();

    expect(statsJson.byAgentMetadata).toBeDefined();
    expect(statsJson.byAgentMetadata["agent-name"]).toBeDefined();
    expect(statsJson.byAgentMetadata["agent-name"].pi.requests).toBe(1);
    expect(statsJson.byAgentMetadata["agent-name"].pi.promptTokens).toBe(120);
    expect(statsJson.byAgentMetadata["agent-name"].claude.requests).toBe(1);
    expect(statsJson.byAgentMetadata["agent-name"].claude.promptTokens).toBe(80);

    expect(statsJson.byAgentMetadata.os.linux.requests).toBe(1);
    expect(statsJson.byAgentMetadata.os.darwin.requests).toBe(1);
    expect(statsJson.byAgentMetadata["client-mode"]["code-assist"].requests).toBe(1);
  });
});
