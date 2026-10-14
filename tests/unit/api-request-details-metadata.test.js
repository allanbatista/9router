import { describe, expect, it, vi } from "vitest";
import { GET as getRequestDetailsRoute } from "../../src/app/api/usage/request-details/route.js";
import { GET as getMetadataValuesRoute } from "../../src/app/api/usage/metadata-values/route.js";

const mockDetailsResult = {
  details: [
    {
      id: "req-1",
      provider: "openai",
      model: "gpt-4o",
      agentMetadata: { os: "linux", "agent-name": "pi", hostname: "box-1" },
      request: { messages: [{ role: "user", content: "secret" }], _agent_metadata: [{ key: "os", value: "linux" }] },
      providerRequest: { messages: [{ role: "user", content: "secret" }] },
      providerResponse: { choices: [{ message: { content: "answer" } }] },
      response: { content: "answer" },
      tokens: { prompt_tokens: 10, completion_tokens: 5 },
      latency: { total: 100 },
      status: "success",
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  },
};

vi.mock("@/lib/usageDb", () => ({
  getRequestDetails: vi.fn(async (filter) => {
    return mockDetailsResult;
  }),
  getDistinctMetadataValues: vi.fn(async (key) => {
    if (key === "agent-name") return ["claude", "pi"];
    if (key === "os") return ["darwin", "linux"];
    return [];
  }),
}));

describe("Usage Request Details & Metadata Values API Routes", () => {
  describe("GET /api/usage/request-details", () => {
    it("preserves agentMetadata intact while redacting messages", async () => {
      const req = new Request("http://localhost:20127/api/usage/request-details?page=1&pageSize=20&agentMetadata.os=linux");
      const res = await getRequestDetailsRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.details.length).toBe(1);
      const item = json.details[0];
      expect(item.id).toBe("req-1");
      expect(item.agentMetadata).toEqual({ os: "linux", "agent-name": "pi", hostname: "box-1" });
      expect(item.request).toEqual({ redacted: true });
      expect(item.providerRequest).toEqual({ redacted: true });
      expect(item.providerResponse).toEqual({ redacted: true });
      expect(item.response).toEqual({ redacted: true });
    });
  });

  describe("GET /api/usage/metadata-values", () => {
    it("returns distinct values for requested metadata key", async () => {
      const req = new Request("http://localhost:20127/api/usage/metadata-values?key=agent-name");
      const res = await getMetadataValuesRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.key).toBe("agent-name");
      expect(json.values).toEqual(["claude", "pi"]);
    });

    it("returns 400 when key query parameter is missing or invalid", async () => {
      const reqNoKey = new Request("http://localhost:20127/api/usage/metadata-values");
      const resNoKey = await getMetadataValuesRoute(reqNoKey);
      expect(resNoKey.status).toBe(400);

      const reqInvalidKey = new Request("http://localhost:20127/api/usage/metadata-values?key=bad%20key!");
      const resInvalidKey = await getMetadataValuesRoute(reqInvalidKey);
      expect(resInvalidKey.status).toBe(400);
    });
  });
});
