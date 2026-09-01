import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock translator index with partial import
vi.mock("open-sse/translator/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    initTranslators: vi.fn(),
  };
});

import { POST, OPTIONS } from "../../src/app/api/dashboard/chat/completions/route.js";
import { handleChat } from "../../src/sse/handlers/chat.js";
import * as localDb from "@/lib/localDb";
import * as modelService from "../../src/sse/services/model.js";
import * as authService from "../../src/sse/services/auth.js";
import * as tokenRefresh from "../../src/sse/services/tokenRefresh.js";
import * as chatCore from "open-sse/handlers/chatCore.js";
describe("POST /api/dashboard/chat/completions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles OPTIONS preflight with CORS headers", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("delegates to handleChat with isDashboardSession: true", async () => {
    vi.spyOn(localDb, "getSettings").mockResolvedValue({
      requireApiKey: true,
    });
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: null,
      model: "test-model-400",
    });
    vi.spyOn(modelService, "getComboConfig").mockResolvedValue(null);

    const req = new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test-model-400",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      }),
    });

    const res = await POST(req);
    // When requireApiKey is true, isDashboardSession bypasses 401 and reaches model resolution
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when model is missing from payload", async () => {
    const req = new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Missing model");
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const req = new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid-json{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Invalid JSON body");
  });
  it("resolves combo:batista-low prefix correctly and streams response", async () => {
    vi.spyOn(localDb, "getSettings").mockResolvedValue({
      requireApiKey: false,
    });
    vi.spyOn(localDb, "getProviderNodes").mockResolvedValue([]);
    vi.spyOn(localDb, "getComboByName").mockImplementation(async (name) => {
      if (name === "batista-low") {
        return { id: "combo-batista-low", name: "batista-low", models: ["openai/gpt-4o-mini(high)"] };
      }
      return null;
    });
    vi.spyOn(authService, "getProviderCredentials").mockResolvedValue({
      apiKey: "sk-test",
      connectionId: "conn-1",
    });
    const mockStreamResponse = new Response("data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
    const handleChatCoreSpy = vi.spyOn(chatCore, "handleChatCore").mockResolvedValue({
      success: true,
      response: mockStreamResponse,
    });
    const req = new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "combo:batista-low",
        messages: [{ role: "user", content: "Hello combo" }],
        stream: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("hello");
    expect(handleChatCoreSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        modelInfo: { provider: "openai", model: "gpt-4o-mini(high)" },
      })
    );
  });
});

describe("src/sse/handlers/chat.js isDashboardSession bypass", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("bypasses requireApiKey when isDashboardSession is passed in options", async () => {
    vi.spyOn(localDb, "getSettings").mockResolvedValue({
      requireApiKey: true,
    });
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: null,
      model: "invalid-test-model",
    });
    vi.spyOn(modelService, "getComboConfig").mockResolvedValue(null);

    // 1. Without isDashboardSession: true, requireApiKey should block request with 401 Unauthorized
    const unauthedReq = new Request("http://localhost/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    const unauthedRes = await handleChat(unauthedReq);
    expect(unauthedRes.status).toBe(401);
    const unauthedBody = await unauthedRes.json();
    expect(unauthedBody.error.message).toBe("Missing API key");

    // 2. With isDashboardSession: true, requireApiKey is bypassed, proceeds past auth to model validation
    const authedReq = new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "invalid-test-model",
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    const authedRes = await handleChat(authedReq, null, { isDashboardSession: true });
    // Bypassed 401 and reached model resolution error (400 Invalid model format)
    expect(authedRes.status).toBe(400);
    const authedBody = await authedRes.json();
    expect(authedBody.error.message).toBe("Invalid model format");
  });
});
