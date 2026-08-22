import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  saveRequestDetail,
  getRequestDetails,
  getRequestDetailById,
  getDistinctProviders,
  flushToDatabase,
  __test__,
} from "../../src/lib/db/repos/requestDetailsRepo.js";

// In-memory store simulating RequestDetail collection
class InMemoryRequestDetailCollection {
  constructor() {
    this.docs = [];
  }

  clear() {
    this.docs = [];
  }

  _clone(doc) {
    if (!doc) return null;
    return JSON.parse(JSON.stringify(doc));
  }

  _makeQuery(promise) {
    return {
      sort: () => ({
        skip: (offset) => ({
          limit: (limit) => ({
            lean: async () => {
              const res = await promise;
              return res.slice(offset, offset + limit);
            },
          }),
          lean: async () => {
            const res = await promise;
            return res.slice(offset);
          },
        }),
        limit: (n) => ({
          select: () => ({
            lean: async () => {
              const res = await promise;
              return res.slice(0, n);
            },
          }),
          lean: async () => {
            const res = await promise;
            return res.slice(0, n);
          },
        }),
        lean: async () => await promise,
      }),
      lean: async () => await promise,
      then: (resolve, reject) => promise.then(resolve, reject),
    };
  }

  async insertMany(docs) {
    for (const d of docs) {
      this.docs.unshift(this._clone(d));
    }
    return docs;
  }

  find(query = {}) {
    const p = (async () => {
      let filtered = [...this.docs];
      if (query.provider) filtered = filtered.filter((d) => d.provider === query.provider);
      if (query.model) filtered = filtered.filter((d) => d.model === query.model);
      if (query.connectionId) filtered = filtered.filter((d) => d.connectionId === query.connectionId);
      if (query.status) filtered = filtered.filter((d) => d.status === query.status);
      if (query.timestamp) {
        if (query.timestamp.$gte) filtered = filtered.filter((d) => new Date(d.timestamp) >= new Date(query.timestamp.$gte));
        if (query.timestamp.$lte) filtered = filtered.filter((d) => new Date(d.timestamp) <= new Date(query.timestamp.$lte));
      }
      return filtered.map((d) => this._clone(d));
    })();
    return this._makeQuery(p);
  }

  findById(id) {
    const p = (async () => {
      const found = this.docs.find((d) => d._id === id);
      return this._clone(found);
    })();
    return this._makeQuery(p);
  }

  async countDocuments(query = {}) {
    let filtered = [...this.docs];
    if (query.provider) filtered = filtered.filter((d) => d.provider === query.provider);
    if (query.model) filtered = filtered.filter((d) => d.model === query.model);
    if (query.connectionId) filtered = filtered.filter((d) => d.connectionId === query.connectionId);
    if (query.status) filtered = filtered.filter((d) => d.status === query.status);
    return filtered.length;
  }

  async distinct(field) {
    const set = new Set();
    for (const d of this.docs) {
      if (d[field]) set.add(d[field]);
    }
    return Array.from(set);
  }

  async deleteMany(query = {}) {
    if (query._id && query._id.$in) {
      const ids = query._id.$in;
      const initial = this.docs.length;
      this.docs = this.docs.filter((d) => !ids.includes(d._id));
      return { deletedCount: initial - this.docs.length };
    }
    return { deletedCount: 0 };
  }
}

const mockRequestDetailCollection = new InMemoryRequestDetailCollection();

vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn(async () => ({})),
}));

vi.mock("../../src/lib/db/models/RequestDetail.js", () => ({
  RequestDetail: {
    insertMany: (docs, opts) => mockRequestDetailCollection.insertMany(docs, opts),
    find: (q) => mockRequestDetailCollection.find(q),
    findById: (id) => mockRequestDetailCollection.findById(id),
    countDocuments: (q) => mockRequestDetailCollection.countDocuments(q),
    distinct: (f, q) => mockRequestDetailCollection.distinct(f, q),
    deleteMany: (q) => mockRequestDetailCollection.deleteMany(q),
  },
}));

vi.mock("../../src/lib/db/repos/settingsRepo.js", () => ({
  getSettings: vi.fn(async () => ({
    enableObservability: true,
    observabilityMaxRecords: 50,
    observabilityBatchSize: 5,
    observabilityFlushIntervalMs: 1000,
    observabilityMaxJsonSize: 5,
  })),
}));

describe("Request Details Observability Repository (V6)", () => {
  beforeEach(() => {
    mockRequestDetailCollection.clear();
    __test__.clearWriteBuffer();
  });

  afterEach(() => {
    __test__.clearWriteBuffer();
  });

  describe("Header sanitization", () => {
    it("sanitizes sensitive headers including Authorization, tokens, and api-keys", () => {
      const headers = {
        authorization: "Bearer secret-jwt",
        "X-Api-Key": "my-api-key",
        cookie: "session=xyz",
        "content-type": "application/json",
        "custom-header": "safe-value",
      };

      const sanitized = __test__.sanitizeHeaders(headers);
      expect(sanitized).toEqual({
        "content-type": "application/json",
        "custom-header": "safe-value",
      });
      expect(sanitized.authorization).toBeUndefined();
      expect(sanitized["X-Api-Key"]).toBeUndefined();
      expect(sanitized.cookie).toBeUndefined();
    });

    it("returns empty object for non-object header inputs", () => {
      expect(__test__.sanitizeHeaders(null)).toEqual({});
      expect(__test__.sanitizeHeaders(undefined)).toEqual({});
      expect(__test__.sanitizeHeaders("string")).toEqual({});
    });
  });

  describe("Buffering and Batch Insert", () => {
    it("buffers saveRequestDetail calls in memory and flushes in batch", async () => {
      const detail1 = {
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        connectionId: "conn-1",
        status: "200",
        request: { messages: [{ role: "user", content: "hello" }] },
        response: { status: 200, content: "hi there" },
      };

      await saveRequestDetail(detail1);
      expect(__test__.getWriteBuffer().length).toBe(1);

      // Trigger batch flush manually
      await flushToDatabase();
      expect(__test__.getWriteBuffer().length).toBe(0);

      const res = await getRequestDetails();
      expect(res.details.length).toBe(1);
      expect(res.details[0].provider).toBe("anthropic");
      expect(res.details[0].model).toBe("claude-3-5-sonnet");
      expect(res.details[0].id).toBeDefined();
    });

    it("automatically triggers flush when buffer reaches batchSize", async () => {
      for (let i = 0; i < 5; i++) {
        await saveRequestDetail({
          provider: "openai",
          model: `gpt-4o-${i}`,
          connectionId: "conn-open",
          status: "200",
        });
      }

      // Buffer reached batchSize (5), flush was triggered
      await new Promise((r) => setTimeout(r, 50));
      const res = await getRequestDetails();
      expect(res.details.length).toBe(5);
    });
  });

  describe("Queries, Filters, Pagination and Distinct Providers", () => {
    beforeEach(async () => {
      const items = [
        { id: "d1", provider: "openai", model: "gpt-4o", connectionId: "c1", status: "200", timestamp: new Date("2026-08-20T10:00:00Z").toISOString() },
        { id: "d2", provider: "anthropic", model: "claude-3-5-sonnet", connectionId: "c2", status: "200", timestamp: new Date("2026-08-21T10:00:00Z").toISOString() },
        { id: "d3", provider: "openai", model: "o1-mini", connectionId: "c1", status: "400", timestamp: new Date("2026-08-22T10:00:00Z").toISOString() },
      ];
      for (const item of items) {
        await saveRequestDetail(item);
      }
      await flushToDatabase();
    });

    it("filters details by provider", async () => {
      const res = await getRequestDetails({ provider: "anthropic" });
      expect(res.details.length).toBe(1);
      expect(res.details[0].provider).toBe("anthropic");
    });

    it("filters details by connectionId", async () => {
      const res = await getRequestDetails({ connectionId: "c1" });
      expect(res.details.length).toBe(2);
    });

    it("retrieves detail by id", async () => {
      const detail = await getRequestDetailById("d2");
      expect(detail).not.toBeNull();
      expect(detail.id).toBe("d2");
      expect(detail.provider).toBe("anthropic");

      expect(await getRequestDetailById("non-existent")).toBeNull();
      expect(await getRequestDetailById(null)).toBeNull();
    });

    it("returns sorted distinct providers list", async () => {
      const providers = await getDistinctProviders();
      expect(providers).toEqual(["anthropic", "openai"]);
    });

    it("paginates query results accurately", async () => {
      const page1 = await getRequestDetails({ page: 1, pageSize: 2 });
      expect(page1.pagination.page).toBe(1);
      expect(page1.pagination.pageSize).toBe(2);
      expect(page1.pagination.totalItems).toBe(3);
      expect(page1.pagination.totalPages).toBe(2);
      expect(page1.pagination.hasNext).toBe(true);
      expect(page1.pagination.hasPrev).toBe(false);
      expect(page1.details.length).toBe(2);

      const page2 = await getRequestDetails({ page: 2, pageSize: 2 });
      expect(page2.pagination.page).toBe(2);
      expect(page2.pagination.hasNext).toBe(false);
      expect(page2.pagination.hasPrev).toBe(true);
      expect(page2.details.length).toBe(1);
    });
  });
});
