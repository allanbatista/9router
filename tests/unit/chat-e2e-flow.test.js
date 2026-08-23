import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// In-memory store for ChatSession model
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
      const wrapped = (async () => {
        const results = await q;
        if (!Array.isArray(results)) return results;
        if (sortObj?.updatedAt === -1) {
          return results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        }
        return results;
      })();
      wrapped.lean = () => wrapped;
      return wrapped;
    };
    return q;
  }

  find(query = {}) {
    return this._makeQuery(
      (async () => {
        const results = [];
        for (const doc of this.docs.values()) {
          results.push(this._clone(doc));
        }
        return results;
      })()
    );
  }

  findById(id) {
    return this._makeQuery(
      (async () => {
        const doc = this.docs.get(id);
        return this._clone(doc);
      })()
    );
  }

  async create(doc) {
    const _id = doc._id || `cs_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const now = new Date();
    const newDoc = {
      ...doc,
      _id,
      createdAt: doc.createdAt ? new Date(doc.createdAt) : now,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : now,
    };
    this.docs.set(_id, newDoc);
    return this._clone(newDoc);
  }

  findByIdAndUpdate(id, update, options = {}) {
    return this._makeQuery(
      (async () => {
        const existing = this.docs.get(id);
        if (!existing) return null;

        const updateData = update.$set ? update.$set : update;
        const now = new Date();
        const updated = {
          ...existing,
          ...updateData,
          updatedAt: now,
        };

        this.docs.set(id, updated);
        return options.new ? this._clone(updated) : this._clone(existing);
      })()
    );
  }

  async deleteOne(query = {}) {
    const id = query._id;
    if (id && this.docs.has(id)) {
      this.docs.delete(id);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async insertMany(docs) {
    if (!Array.isArray(docs)) return [];
    const inserted = [];
    for (const doc of docs) {
      const _id = doc._id || `cs_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const newDoc = {
        ...doc,
        _id,
        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
      };
      this.docs.set(_id, newDoc);
      inserted.push(this._clone(newDoc));
    }
    return inserted;
  }

  async deleteMany() {
    const count = this.docs.size;
    this.docs.clear();
    return { deletedCount: count };
  }
}

// Generic store for other models
class GenericStore {
  constructor() {
    this.docs = new Map();
  }
  clear() {
    this.docs.clear();
  }
  _clone(d) {
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }
  _makeQuery(p) {
    const q = p;
    q.lean = () => q;
    q.sort = () => q;
    return q;
  }
  find() {
    return this._makeQuery(Promise.resolve(Array.from(this.docs.values()).map(this._clone)));
  }
  findById(id) {
    return this._makeQuery(Promise.resolve(this._clone(this.docs.get(id))));
  }
  async findOneAndUpdate(query, update, options = {}) {
    const id = query._id || query.id || "global";
    const existing = this.docs.get(id) || { _id: id };
    const updateData = update.$set ? update.$set : update;
    const updated = { ...existing, ...updateData };
    this.docs.set(id, updated);
    return this._clone(updated);
  }
  findOne(query = {}) {
    return this._makeQuery(Promise.resolve(Array.from(this.docs.values())[0] || null));
  }
  async insertMany(docs = []) {
    for (const d of docs) {
      const id = d._id || d.id || `gen_${Date.now()}_${Math.random()}`;
      this.docs.set(id, { ...d, _id: id });
    }
    return docs;
  }
  async deleteMany() {
    this.docs.clear();
    return { deletedCount: 0 };
  }
}

const mockChatSessionStore = new ChatSessionInMemoryStore();
const mockOtherStores = {
  Setting: new GenericStore(),
  ProviderConnection: new GenericStore(),
  ProviderNode: new GenericStore(),
  ProxyPool: new GenericStore(),
  ApiKey: new GenericStore(),
  Combo: new GenericStore(),
  KvEntry: new GenericStore(),
};

// Mock connection
vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn().mockResolvedValue({ connection: { readyState: 1 } }),
  disconnectDb: vi.fn().mockResolvedValue(),
  getMongoConfig: vi.fn().mockReturnValue({ uri: "mongodb://127.0.0.1:27017/9router" }),
}));

// Mock open-sse translator
vi.mock("open-sse/translator/index.js", () => ({
  initTranslators: vi.fn().mockResolvedValue(),
}));

// Mock chat handler to simulate streaming SSE tokens
vi.mock("@/sse/handlers/chat.js", () => ({
  handleChat: vi.fn(async (request, clientRawRequest, options) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!body.model) {
      return new Response(JSON.stringify({ error: "Missing model" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate simulated SSE token chunks based on prompt
    const userPrompt = Array.isArray(body.messages)
      ? body.messages[body.messages.length - 1]?.content
      : "";
    const promptText = typeof userPrompt === "string"
      ? userPrompt
      : Array.isArray(userPrompt)
      ? userPrompt.find((p) => p.type === "text")?.text || "multimodal prompt"
      : "test prompt";

    const chunks = [
      `data: {"id":"chatcmpl-1","choices":[{"delta":{"role":"assistant"},"index":0}]}\n\n`,
      `data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Echo: "},"index":0}]}\n\n`,
      `data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"${promptText.replace(/"/g, '\\"')}"},"index":0}]}\n\n`,
      `data: [DONE]\n\n`,
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }),
}));

import { ChatSession } from "../../src/lib/db/models/ChatSession.js";
import { Setting } from "../../src/lib/db/models/Setting.js";
import { ProviderConnection } from "../../src/lib/db/models/ProviderConnection.js";
import { ProviderNode } from "../../src/lib/db/models/ProviderNode.js";
import { ProxyPool } from "../../src/lib/db/models/ProxyPool.js";
import { ApiKey } from "../../src/lib/db/models/ApiKey.js";
import { Combo } from "../../src/lib/db/models/Combo.js";
import { KvEntry } from "../../src/lib/db/models/KvEntry.js";

import { GET as getSessionsRoute, POST as createSessionRoute } from "../../src/app/api/chat/sessions/route.js";
import {
  GET as getSessionByIdRoute,
  PATCH as patchSessionRoute,
  DELETE as deleteSessionRoute,
} from "../../src/app/api/chat/sessions/[id]/route.js";
import { POST as dashboardChatCompletionsRoute } from "../../src/app/api/dashboard/chat/completions/route.js";
import {
  resolveActiveConversationPath,
  getMessageSiblings,
} from "../../src/app/(dashboard)/dashboard/chat/components/ChatMessageList.js";
import { exportDb, importDb } from "../../src/lib/db/index.js";

// Helper to parse SSE stream chunks
async function readAllSSEChunks(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let accumulated = "";
  const deltas = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
  }

  const lines = accumulated.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) deltas.push(delta);
    } catch {
      // ignore
    }
  }

  return { raw: accumulated, deltas, fullText: deltas.join("") };
}

describe("E2E Chat Screen Complete Lifecycle Integration Flow", () => {
  beforeEach(() => {
    mockChatSessionStore.clear();
    for (const store of Object.values(mockOtherStores)) {
      store.clear();
    }

    // Attach mock methods to models
    ChatSession.find = (...args) => mockChatSessionStore.find(...args);
    ChatSession.findById = (...args) => mockChatSessionStore.findById(...args);
    ChatSession.create = (...args) => mockChatSessionStore.create(...args);
    ChatSession.findByIdAndUpdate = (...args) => mockChatSessionStore.findByIdAndUpdate(...args);
    ChatSession.deleteOne = (...args) => mockChatSessionStore.deleteOne(...args);
    ChatSession.insertMany = (...args) => mockChatSessionStore.insertMany(...args);
    ChatSession.deleteMany = (...args) => mockChatSessionStore.deleteMany(...args);

    Setting.find = (...args) => mockOtherStores.Setting.find(...args);
    Setting.findById = (...args) => mockOtherStores.Setting.findById(...args);
    Setting.findOne = (...args) => mockOtherStores.Setting.findOne(...args);
    Setting.findOneAndUpdate = (...args) => mockOtherStores.Setting.findOneAndUpdate(...args);
    Setting.deleteMany = (...args) => mockOtherStores.Setting.deleteMany(...args);
    Setting.insertMany = (...args) => mockOtherStores.Setting.insertMany(...args);

    ProviderConnection.find = (...args) => mockOtherStores.ProviderConnection.find(...args);
    ProviderConnection.findById = (...args) => mockOtherStores.ProviderConnection.findById(...args);
    ProviderConnection.deleteMany = (...args) => mockOtherStores.ProviderConnection.deleteMany(...args);
    ProviderConnection.insertMany = (...args) => mockOtherStores.ProviderConnection.insertMany(...args);

    ProviderNode.find = (...args) => mockOtherStores.ProviderNode.find(...args);
    ProviderNode.findById = (...args) => mockOtherStores.ProviderNode.findById(...args);
    ProviderNode.deleteMany = (...args) => mockOtherStores.ProviderNode.deleteMany(...args);
    ProviderNode.insertMany = (...args) => mockOtherStores.ProviderNode.insertMany(...args);

    ProxyPool.find = (...args) => mockOtherStores.ProxyPool.find(...args);
    ProxyPool.findById = (...args) => mockOtherStores.ProxyPool.findById(...args);
    ProxyPool.deleteMany = (...args) => mockOtherStores.ProxyPool.deleteMany(...args);
    ProxyPool.insertMany = (...args) => mockOtherStores.ProxyPool.insertMany(...args);

    ApiKey.find = (...args) => mockOtherStores.ApiKey.find(...args);
    ApiKey.findById = (...args) => mockOtherStores.ApiKey.findById(...args);
    ApiKey.deleteMany = (...args) => mockOtherStores.ApiKey.deleteMany(...args);
    ApiKey.insertMany = (...args) => mockOtherStores.ApiKey.insertMany(...args);

    Combo.find = (...args) => mockOtherStores.Combo.find(...args);
    Combo.findById = (...args) => mockOtherStores.Combo.findById(...args);
    Combo.deleteMany = (...args) => mockOtherStores.Combo.deleteMany(...args);
    Combo.insertMany = (...args) => mockOtherStores.Combo.insertMany(...args);

    KvEntry.find = (...args) => mockOtherStores.KvEntry.find(...args);
    KvEntry.findById = (...args) => mockOtherStores.KvEntry.findById(...args);
    KvEntry.deleteMany = (...args) => mockOtherStores.KvEntry.deleteMany(...args);
    KvEntry.insertMany = (...args) => mockOtherStores.KvEntry.insertMany(...args);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes full E2E flow: creation -> image attachment & prompt -> streaming -> stop abort -> branching edit -> rename -> deletion -> backup roundtrip", async () => {
    // -------------------------------------------------------------
    // Step 1: Session creation in MongoDB (POST /api/chat/sessions)
    // -------------------------------------------------------------
    const createReq = new Request("http://localhost/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Chat",
        modelId: "gpt-4o",
        providerId: "openai",
        systemPrompt: "You are a helpful and concise coding assistant.",
      }),
    });

    const createRes = await createSessionRoute(createReq);
    expect(createRes.status).toBe(201);
    const { session: initialSession } = await createRes.json();

    expect(initialSession.id).toBeDefined();
    expect(initialSession.title).toBe("New Chat");
    expect(initialSession.modelId).toBe("gpt-4o");
    expect(initialSession.providerId).toBe("openai");
    expect(initialSession.systemPrompt).toBe("You are a helpful and concise coding assistant.");
    expect(initialSession.messages).toEqual([]);

    const sessionId = initialSession.id;

    // Verify session is listed in GET /api/chat/sessions
    const listRes = await getSessionsRoute();
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.sessions).toHaveLength(1);
    expect(listData.sessions[0].id).toBe(sessionId);

    // -------------------------------------------------------------
    // Step 2: Attaching images & configuring Turn 1 user prompt
    // -------------------------------------------------------------
    const userMessage1 = {
      id: "msg_user_1",
      parentId: null,
      role: "user",
      content: "Explain this diagram and write a quick script.",
      attachments: [
        {
          id: "att_1",
          name: "diagram.png",
          type: "image/png",
          dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        },
      ],
      createdAt: new Date().toISOString(),
    };

    // -------------------------------------------------------------
    // Step 3: Streaming chat completion (POST /api/dashboard/chat/completions)
    // -------------------------------------------------------------
    const chatReq = new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: initialSession.modelId,
        messages: [
          { role: "system", content: initialSession.systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userMessage1.content },
              { type: "image_url", image_url: { url: userMessage1.attachments[0].dataUrl } },
            ],
          },
        ],
        stream: true,
      }),
    });

    const chatRes = await dashboardChatCompletionsRoute(chatReq);
    expect(chatRes.status).toBe(200);
    expect(chatRes.headers.get("Content-Type")).toContain("text/event-stream");

    const { deltas, fullText } = await readAllSSEChunks(chatRes);
    expect(deltas.length).toBeGreaterThan(0);
    expect(fullText).toContain("Explain this diagram");

    // Persist Turn 1 assistant reply to MongoDB
    const assistantMessage1 = {
      id: "msg_asst_1",
      parentId: userMessage1.id,
      role: "assistant",
      content: fullText,
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    const patchReq1 = new Request(`http://localhost/api/chat/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [userMessage1, assistantMessage1],
      }),
    });
    const patchRes1 = await patchSessionRoute(patchReq1, { params: Promise.resolve({ id: sessionId }) });
    expect(patchRes1.status).toBe(200);

    // -------------------------------------------------------------
    // Step 4: Abort / Stop generating with partial token preservation
    // -------------------------------------------------------------
    const userMessage2 = {
      id: "msg_user_2",
      parentId: assistantMessage1.id,
      role: "user",
      content: "Write a long story about space exploration.",
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    // Simulate partial streaming chunk accumulation before abort
    const partialAssistantText = "Once upon a time in the year 3042, the starship Odyssey";
    const abortedAssistantMessage = {
      id: "msg_asst_2_partial",
      parentId: userMessage2.id,
      role: "assistant",
      content: partialAssistantText, // partial tokens preserved after user clicked Stop
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    const patchReq2 = new Request(`http://localhost/api/chat/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [userMessage1, assistantMessage1, userMessage2, abortedAssistantMessage],
      }),
    });
    const patchRes2 = await patchSessionRoute(patchReq2, { params: Promise.resolve({ id: sessionId }) });
    expect(patchRes2.status).toBe(200);

    // Verify partial content is persisted in DB
    const getResAfterStop = await getSessionByIdRoute(
      new Request(`http://localhost/api/chat/sessions/${sessionId}`),
      { params: Promise.resolve({ id: sessionId }) }
    );
    const { session: sessionAfterStop } = await getResAfterStop.json();
    expect(sessionAfterStop.messages).toHaveLength(4);
    expect(sessionAfterStop.messages[3].content).toBe(partialAssistantText);

    // -------------------------------------------------------------
    // Step 5: Editing previous user message, branching with parentId (< 1/2 >)
    // -------------------------------------------------------------
    // Edit Turn 2: branched prompt with the same parentId (assistantMessage1.id)
    const branchedUserMessage2 = {
      id: "msg_user_2_branch_b",
      parentId: assistantMessage1.id, // same parent creates alternate branch
      role: "user",
      content: "Write a concise Python script to calculate Fibonacci numbers.",
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    const branchedAssistantMessage2 = {
      id: "msg_asst_2_branch_b",
      parentId: branchedUserMessage2.id,
      role: "assistant",
      content: "```python\ndef fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        yield a\n        a, b = b, a + b\n```",
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    const allSessionMessages = [
      userMessage1,
      assistantMessage1,
      userMessage2,
      abortedAssistantMessage,
      branchedUserMessage2,
      branchedAssistantMessage2,
    ];

    const patchReqBranch = new Request(`http://localhost/api/chat/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: allSessionMessages,
      }),
    });
    const patchResBranch = await patchSessionRoute(patchReqBranch, { params: Promise.resolve({ id: sessionId }) });
    expect(patchResBranch.status).toBe(200);

    // Branch Navigation Validation via resolveActiveConversationPath
    // Case A: Default view (picks latest branch B by default)
    const activePathDefault = resolveActiveConversationPath(allSessionMessages, {});
    expect(activePathDefault.map((m) => m.id)).toEqual([
      "msg_user_1",
      "msg_asst_1",
      "msg_user_2_branch_b",
      "msg_asst_2_branch_b",
    ]);

    // Case B: User navigates back to Branch 1 (< 1/2 >)
    const activePathBranch1 = resolveActiveConversationPath(allSessionMessages, {
      [assistantMessage1.id]: userMessage2.id,
    });
    expect(activePathBranch1.map((m) => m.id)).toEqual([
      "msg_user_1",
      "msg_asst_1",
      "msg_user_2",
      "msg_asst_2_partial",
    ]);

    // Verify siblings helper returns both variants for Turn 2
    const siblings = getMessageSiblings(allSessionMessages, userMessage2);
    expect(siblings).toHaveLength(2);
    expect(siblings.map((s) => s.id)).toEqual(["msg_user_2", "msg_user_2_branch_b"]);

    // -------------------------------------------------------------
    // Step 6: Renaming session title (PATCH /api/chat/sessions/[id])
    // -------------------------------------------------------------
    const renameReq = new Request(`http://localhost/api/chat/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Python Fibonacci & Diagrams" }),
    });
    const renameRes = await patchSessionRoute(renameReq, { params: Promise.resolve({ id: sessionId }) });
    expect(renameRes.status).toBe(200);
    const { session: renamedSession } = await renameRes.json();
    expect(renamedSession.title).toBe("Python Fibonacci & Diagrams");

    // -------------------------------------------------------------
    // Step 7: Export / Import roundtrip through exportDb() and importDb()
    // -------------------------------------------------------------
    const exportedBackup = await exportDb();
    expect(exportedBackup.chatSessions).toBeDefined();
    expect(exportedBackup.chatSessions).toHaveLength(1);
    expect(exportedBackup.chatSessions[0].id).toBe(sessionId);
    expect(exportedBackup.chatSessions[0].title).toBe("Python Fibonacci & Diagrams");
    expect(exportedBackup.chatSessions[0].messages).toHaveLength(6);

    // Clear database collection and verify restore
    mockChatSessionStore.clear();
    const emptyListRes = await getSessionsRoute();
    const { sessions: emptySessions } = await emptyListRes.json();
    expect(emptySessions).toHaveLength(0);

    // Reimport from snapshot
    await importDb(exportedBackup);

    const restoredGetRes = await getSessionByIdRoute(
      new Request(`http://localhost/api/chat/sessions/${sessionId}`),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(restoredGetRes.status).toBe(200);
    const { session: restoredSession } = await restoredGetRes.json();
    expect(restoredSession.id).toBe(sessionId);
    expect(restoredSession.title).toBe("Python Fibonacci & Diagrams");
    expect(restoredSession.systemPrompt).toBe("You are a helpful and concise coding assistant.");
    expect(restoredSession.messages).toHaveLength(6);
    expect(restoredSession.messages[0].attachments).toHaveLength(1);
    expect(restoredSession.messages[0].attachments[0].name).toBe("diagram.png");

    // -------------------------------------------------------------
    // Step 8: Deleting session (DELETE /api/chat/sessions/[id])
    // -------------------------------------------------------------
    const deleteReq = new Request(`http://localhost/api/chat/sessions/${sessionId}`, {
      method: "DELETE",
    });
    const deleteRes = await deleteSessionRoute(deleteReq, { params: Promise.resolve({ id: sessionId }) });
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);

    // Confirm session no longer exists (404)
    const verifyNotFoundRes = await getSessionByIdRoute(
      new Request(`http://localhost/api/chat/sessions/${sessionId}`),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(verifyNotFoundRes.status).toBe(404);

    // Final list is empty
    const finalListRes = await getSessionsRoute();
    const finalListData = await finalListRes.json();
    expect(finalListData.sessions).toHaveLength(0);
  });
});
