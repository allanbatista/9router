import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getChatSessions,
  getChatSessionById,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  exportChatSessions,
  importChatSessions,
} from "../../src/lib/db/repos/chatSessionsRepo.js";
import { ChatSession } from "../../src/lib/db/models/ChatSession.js";

// In-memory collection helper
class ChatSessionInMemoryStore {
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
    q.sort = (sortObj) => {
      return this._makeQuery(
        promise.then((results) => {
          if (!sortObj) return results;
          const copy = [...results];
          copy.sort((a, b) => {
            for (const [key, dir] of Object.entries(sortObj)) {
              const valA = new Date(a[key]).getTime() || a[key];
              const valB = new Date(b[key]).getTime() || b[key];
              if (valA < valB) return dir === 1 ? -1 : 1;
              if (valA > valB) return dir === 1 ? 1 : -1;
            }
            return 0;
          });
          return copy;
        })
      );
    };
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

  findOne(query = {}) {
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

  async create(doc) {
    const cloned = this._clone(doc);
    this.docs.set(String(cloned._id), cloned);
    return cloned;
  }

  findByIdAndUpdate(id, update, options = {}) {
    return this._makeQuery(
      (async () => {
        const existing = this.docs.get(String(id));
        if (!existing) return null;
        const setFields = update.$set || update;
        const updated = { ...existing, ...setFields };
        this.docs.set(String(id), updated);
        return options.new ? this._clone(updated) : this._clone(existing);
      })()
    );
  }

  async deleteOne(query = {}) {
    if (query._id && this.docs.has(String(query._id))) {
      this.docs.delete(String(query._id));
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async insertMany(docs) {
    for (const doc of docs) {
      this.docs.set(String(doc._id), this._clone(doc));
    }
    return docs;
  }

  async deleteMany() {
    const count = this.docs.size;
    this.docs.clear();
    return { deletedCount: count };
  }
}

const mockStore = new ChatSessionInMemoryStore();

describe("ChatSessions Repository Suite", () => {
  beforeEach(() => {
    mockStore.clear();

    vi.mock("../../src/lib/db/connection.js", () => ({
      getConnection: vi.fn().mockResolvedValue({ connection: { readyState: 1 } }),
      disconnectDb: vi.fn().mockResolvedValue(),
      getMongoConfig: vi.fn().mockReturnValue({ uri: "mongodb://127.0.0.1:27017/9router" }),
    }));

    ChatSession.find = (...args) => mockStore.find(...args);
    ChatSession.findById = (...args) => mockStore.findById(...args);
    ChatSession.findOne = (...args) => mockStore.findOne(...args);
    ChatSession.create = (...args) => mockStore.create(...args);
    ChatSession.findByIdAndUpdate = (...args) => mockStore.findByIdAndUpdate(...args);
    ChatSession.deleteOne = (...args) => mockStore.deleteOne(...args);
    ChatSession.insertMany = (...args) => mockStore.insertMany(...args);
    ChatSession.deleteMany = (...args) => mockStore.deleteMany(...args);
  });

  describe("CRUD Operations", () => {
    it("creates a new chat session with defaults and message tree", async () => {
      const session = await createChatSession({
        modelId: "gpt-4o",
        providerId: "openai",
        systemPrompt: "You are a helpful coding assistant.",
        messages: [
          {
            id: "msg-1",
            parentId: null,
            role: "user",
            content: "What is 2+2?",
            attachments: [],
          },
          {
            id: "msg-2",
            parentId: "msg-1",
            role: "assistant",
            content: "2 + 2 = 4.",
            attachments: [],
          },
        ],
      });

      expect(session).toBeDefined();
      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(session.title).toBe("New chat");
      expect(session.modelId).toBe("gpt-4o");
      expect(session.providerId).toBe("openai");
      expect(session.systemPrompt).toBe("You are a helpful coding assistant.");
      expect(session.messages).toHaveLength(2);
      expect(session.messages[0]).toEqual({
        id: "msg-1",
        parentId: null,
        role: "user",
        content: "What is 2+2?",
        attachments: [],
        createdAt: expect.any(String),
      });
      expect(session.messages[1]).toEqual({
        id: "msg-2",
        parentId: "msg-1",
        role: "assistant",
        content: "2 + 2 = 4.",
        attachments: [],
        createdAt: expect.any(String),
      });
    });

    it("retrieves all chat session summaries ordered by updatedAt descending", async () => {
      const s1 = await createChatSession({
        title: "Chat 1",
        modelId: "gpt-4o",
        createdAt: new Date("2026-08-20T10:00:00.000Z"),
        updatedAt: new Date("2026-08-20T10:00:00.000Z"),
        messages: [{ role: "user", content: "Hi" }],
      });
      const s2 = await createChatSession({
        title: "Chat 2",
        modelId: "claude-3-5-sonnet",
        createdAt: new Date("2026-08-21T10:00:00.000Z"),
        updatedAt: new Date("2026-08-22T10:00:00.000Z"),
        messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }],
      });

      const list = await getChatSessions();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe(s2.id);
      expect(list[0].title).toBe("Chat 2");
      expect(list[0].messageCount).toBe(2);
      expect(list[0].messages).toBeUndefined();

      expect(list[1].id).toBe(s1.id);
      expect(list[1].title).toBe("Chat 1");
      expect(list[1].messageCount).toBe(1);
    });

    it("retrieves a single chat session by id with full message payload", async () => {
      const created = await createChatSession({
        title: "Detailed Chat",
        modelId: "gemini-1.5-pro",
        providerId: "google",
        systemPrompt: "Be precise",
        messages: [
          {
            id: "u1",
            parentId: null,
            role: "user",
            content: "Explain quicksort",
            attachments: [{ name: "diag.png", type: "image/png", dataUrl: "data:image/png;base64,aaa" }],
          },
        ],
      });

      const found = await getChatSessionById(created.id);
      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.title).toBe("Detailed Chat");
      expect(found.modelId).toBe("gemini-1.5-pro");
      expect(found.providerId).toBe("google");
      expect(found.systemPrompt).toBe("Be precise");
      expect(found.messages).toHaveLength(1);
      expect(found.messages[0].attachments[0].name).toBe("diag.png");
    });

    it("returns null for non-existent session id", async () => {
      const nonExistent = await getChatSessionById("non-existent-id");
      expect(nonExistent).toBeNull();
      const empty = await getChatSessionById(null);
      expect(empty).toBeNull();
    });

    it("updates session title and systemPrompt", async () => {
      const created = await createChatSession({
        title: "Initial Title",
        modelId: "gpt-4o",
      });

      const updated = await updateChatSession(created.id, {
        title: "Renamed Title",
        systemPrompt: "New instructions",
      });

      expect(updated).toBeDefined();
      expect(updated.title).toBe("Renamed Title");
      expect(updated.systemPrompt).toBe("New instructions");
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());

      const fetched = await getChatSessionById(created.id);
      expect(fetched.title).toBe("Renamed Title");
      expect(fetched.systemPrompt).toBe("New instructions");
    });

    it("deletes a chat session by id", async () => {
      const created = await createChatSession({
        title: "To Delete",
        modelId: "gpt-4o",
      });

      const deleted = await deleteChatSession(created.id);
      expect(deleted).toBe(true);

      const check = await getChatSessionById(created.id);
      expect(check).toBeNull();

      const deleteAgain = await deleteChatSession(created.id);
      expect(deleteAgain).toBe(false);

      const deleteNull = await deleteChatSession(null);
      expect(deleteNull).toBe(false);
    });
  });

  describe("Branching Message Tree Updates", () => {
    it("appends new message branch nodes without destroying earlier siblings", async () => {
      const session = await createChatSession({
        title: "Branching Tree Test",
        modelId: "gpt-4o",
        messages: [
          { id: "root-1", parentId: null, role: "user", content: "Tell me a joke" },
          { id: "ans-1", parentId: "root-1", role: "assistant", content: "Why did the chicken cross the road?" },
        ],
      });

      // Branching: User edits root prompt, creating root-2 with parentId: null and assistant reply ans-2
      const updatedMessages = [
        ...session.messages,
        { id: "root-2", parentId: null, role: "user", content: "Tell me a riddle" },
        { id: "ans-2", parentId: "root-2", role: "assistant", content: "What has keys but no locks?" },
      ];

      const updatedSession = await updateChatSession(session.id, {
        messages: updatedMessages,
      });

      expect(updatedSession.messages).toHaveLength(4);
      expect(updatedSession.messages.map((m) => m.id)).toEqual(["root-1", "ans-1", "root-2", "ans-2"]);

      // Verify branch 1 reconstruction
      const branch1 = updatedSession.messages.filter((m) => m.id === "root-1" || m.parentId === "root-1");
      expect(branch1).toHaveLength(2);
      expect(branch1[0].content).toBe("Tell me a joke");
      expect(branch1[1].content).toBe("Why did the chicken cross the road?");

      // Verify branch 2 reconstruction
      const branch2 = updatedSession.messages.filter((m) => m.id === "root-2" || m.parentId === "root-2");
      expect(branch2).toHaveLength(2);
      expect(branch2[0].content).toBe("Tell me a riddle");
      expect(branch2[1].content).toBe("What has keys but no locks?");
    });
  });

  describe("Export and Import Roundtrips", () => {
    it("exports all sessions and imports them into a clean collection", async () => {
      const s1 = await createChatSession({
        title: "Export Session 1",
        modelId: "gpt-4o",
        systemPrompt: "System 1",
        messages: [{ id: "m1", parentId: null, role: "user", content: "Hello" }],
      });
      const s2 = await createChatSession({
        title: "Export Session 2",
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
        messages: [{ id: "m2", parentId: null, role: "user", content: "World" }],
      });

      const exported = await exportChatSessions();
      expect(exported).toHaveLength(2);
      expect(exported.find((s) => s.id === s1.id)).toBeDefined();
      expect(exported.find((s) => s.id === s2.id)).toBeDefined();

      // Wipe store and reimport
      mockStore.clear();
      expect(await getChatSessions()).toHaveLength(0);

      const imported = await importChatSessions(exported);
      expect(imported).toHaveLength(2);

      const reloadedS1 = await getChatSessionById(s1.id);
      expect(reloadedS1).toBeDefined();
      expect(reloadedS1.title).toBe("Export Session 1");
      expect(reloadedS1.systemPrompt).toBe("System 1");
      expect(reloadedS1.messages).toHaveLength(1);
      expect(reloadedS1.messages[0].content).toBe("Hello");

      const reloadedS2 = await getChatSessionById(s2.id);
      expect(reloadedS2).toBeDefined();
      expect(reloadedS2.title).toBe("Export Session 2");
      expect(reloadedS2.providerId).toBe("anthropic");
      expect(reloadedS2.messages).toHaveLength(1);
      expect(reloadedS2.messages[0].content).toBe("World");
    });

    it("handles empty arrays gracefully on import", async () => {
      const resultEmpty = await importChatSessions([]);
      expect(resultEmpty).toEqual([]);
      const resultNull = await importChatSessions(null);
      expect(resultNull).toEqual([]);
    });
  });
});
