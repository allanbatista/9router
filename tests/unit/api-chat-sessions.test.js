import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock localDb methods
const mockSessions = new Map();

vi.mock("@/lib/localDb", () => ({
  getChatSessions: vi.fn(async () => {
    return Array.from(mockSessions.values()).map((s) => ({
      id: s.id,
      title: s.title,
      modelId: s.modelId,
      providerId: s.providerId,
      systemPrompt: s.systemPrompt,
      messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }),
  getChatSessionById: vi.fn(async (id) => {
    const session = mockSessions.get(id);
    return session ? { ...session } : null;
  }),
  createChatSession: vi.fn(async (data) => {
    const id = data.id || `session-${Date.now()}`;
    const now = new Date().toISOString();
    const session = {
      id,
      title: data.title || "New chat",
      modelId: data.modelId || "default",
      providerId: data.providerId ?? null,
      systemPrompt: data.systemPrompt ?? null,
      messages: data.messages || [],
      createdAt: now,
      updatedAt: now,
    };
    mockSessions.set(id, session);
    return session;
  }),
  updateChatSession: vi.fn(async (id, data) => {
    const existing = mockSessions.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    mockSessions.set(id, updated);
    return updated;
  }),
  deleteChatSession: vi.fn(async (id) => {
    if (!mockSessions.has(id)) return false;
    mockSessions.delete(id);
    return true;
  }),
}));

import { GET as getSessions, POST as createSession } from "../../src/app/api/chat/sessions/route.js";
import { GET as getSessionById, PATCH as patchSession, DELETE as deleteSession } from "../../src/app/api/chat/sessions/[id]/route.js";

describe("API Chat Sessions Routes", () => {
  beforeEach(() => {
    mockSessions.clear();
  });

  describe("GET /api/chat/sessions", () => {
    it("returns empty array when no sessions exist", async () => {
      const res = await getSessions();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ sessions: [] });
    });

    it("returns sessions sorted by updatedAt descending", async () => {
      mockSessions.set("s1", {
        id: "s1",
        title: "Older session",
        modelId: "gpt-4o",
        providerId: "openai",
        systemPrompt: null,
        messages: [{ id: "m1", role: "user", content: "Hi" }],
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
      });
      mockSessions.set("s2", {
        id: "s2",
        title: "Newer session",
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
        systemPrompt: "Be concise",
        messages: [],
        createdAt: "2026-08-22T10:00:00.000Z",
        updatedAt: "2026-08-22T12:00:00.000Z",
      });

      const res = await getSessions();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessions).toHaveLength(2);
      expect(data.sessions[0].id).toBe("s2");
      expect(data.sessions[0].messageCount).toBe(0);
      expect(data.sessions[1].id).toBe("s1");
      expect(data.sessions[1].messageCount).toBe(1);
    });
  });

  describe("POST /api/chat/sessions", () => {
    it("creates a new session and returns 201 with session detail", async () => {
      const req = new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Custom Session",
          modelId: "gpt-4o",
          providerId: "openai",
          systemPrompt: "You are a coding assistant",
          messages: [{ id: "m1", role: "user", content: "Hello" }],
        }),
      });

      const res = await createSession(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.session).toBeDefined();
      expect(data.session.title).toBe("Custom Session");
      expect(data.session.modelId).toBe("gpt-4o");
      expect(data.session.providerId).toBe("openai");
      expect(data.session.systemPrompt).toBe("You are a coding assistant");
      expect(data.session.messages).toHaveLength(1);
    });

    it("creates default session when empty payload provided", async () => {
      const req = new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await createSession(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.session.title).toBe("New chat");
      expect(data.session.modelId).toBe("default");
      expect(data.session.messages).toEqual([]);
    });
  });

  describe("GET /api/chat/sessions/[id]", () => {
    it("returns session detail for valid id", async () => {
      mockSessions.set("test-id", {
        id: "test-id",
        title: "Test Session",
        modelId: "gpt-4o",
        providerId: null,
        systemPrompt: null,
        messages: [{ id: "m1", parentId: null, role: "user", content: "Hey" }],
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
      });

      const res = await getSessionById(new Request("http://localhost/api/chat/sessions/test-id"), {
        params: Promise.resolve({ id: "test-id" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session.id).toBe("test-id");
      expect(data.session.messages).toHaveLength(1);
      expect(data.session.messages[0].content).toBe("Hey");
    });

    it("returns 404 when session does not exist", async () => {
      const res = await getSessionById(new Request("http://localhost/api/chat/sessions/non-existent"), {
        params: Promise.resolve({ id: "non-existent" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Session not found");
    });
  });

  describe("PATCH /api/chat/sessions/[id]", () => {
    it("updates title, systemPrompt, modelId and messages", async () => {
      mockSessions.set("s1", {
        id: "s1",
        title: "Old Title",
        modelId: "gpt-4o",
        providerId: null,
        systemPrompt: null,
        messages: [],
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
      });

      const req = new Request("http://localhost/api/chat/sessions/s1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New Title",
          systemPrompt: "Updated prompt",
          modelId: "claude-3-5-sonnet",
          messages: [
            { id: "m1", parentId: null, role: "user", content: "Hi" },
            { id: "m2", parentId: "m1", role: "assistant", content: "Hello!" },
          ],
        }),
      });

      const res = await patchSession(req, {
        params: Promise.resolve({ id: "s1" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session.title).toBe("New Title");
      expect(data.session.systemPrompt).toBe("Updated prompt");
      expect(data.session.modelId).toBe("claude-3-5-sonnet");
      expect(data.session.messages).toHaveLength(2);
    });

    it("returns 404 when patching non-existent session", async () => {
      const req = new Request("http://localhost/api/chat/sessions/missing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });

      const res = await patchSession(req, {
        params: Promise.resolve({ id: "missing" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Session not found");
    });
  });

  describe("DELETE /api/chat/sessions/[id]", () => {
    it("deletes existing session and returns success: true", async () => {
      mockSessions.set("s1", { id: "s1", title: "To Delete" });

      const res = await deleteSession(new Request("http://localhost/api/chat/sessions/s1", { method: "DELETE" }), {
        params: Promise.resolve({ id: "s1" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockSessions.has("s1")).toBe(false);
    });

    it("returns 404 when deleting non-existent session", async () => {
      const res = await deleteSession(new Request("http://localhost/api/chat/sessions/missing", { method: "DELETE" }), {
        params: Promise.resolve({ id: "missing" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Session not found");
    });
  });
});
