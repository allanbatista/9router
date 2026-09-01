import { describe, expect, it } from "vitest";
import {
  Setting,
  SettingSchema,
  ProviderConnection,
  ProviderConnectionSchema,
  ProviderNode,
  ProviderNodeSchema,
  ProxyPool,
  ProxyPoolSchema,
  ApiKey,
  ApiKeySchema,
  Combo,
  ComboSchema,
  KvEntry,
  KvEntrySchema,
  UsageHistory,
  UsageHistorySchema,
  UsageDaily,
  UsageDailySchema,
  RequestDetail,
  RequestDetailSchema,
  SessionAffinity,
  SessionAffinitySchema,
  ComboAffinity,
  ComboAffinitySchema,
  Meta,
  MetaSchema,
  ChatSession,
  ChatSessionSchema,
  ChatMessageSchema,
} from "../../src/lib/db/models/index.js";

describe("Mongoose Models Suite", () => {
  describe("Exports verification", () => {
    it("exports all 14 models and schemas", () => {
      const models = [
        Setting,
        ProviderConnection,
        ProviderNode,
        ProxyPool,
        ApiKey,
        Combo,
        KvEntry,
        UsageHistory,
        UsageDaily,
        RequestDetail,
        SessionAffinity,
        ComboAffinity,
        Meta,
        ChatSession,
      ];
      expect(models).toHaveLength(14);
      for (const model of models) {
        expect(model).toBeDefined();
        expect(typeof model).toBe("function");
        expect(model.modelName).toBeDefined();
      }

      const schemas = [
        SettingSchema,
        ProviderConnectionSchema,
        ProviderNodeSchema,
        ProxyPoolSchema,
        ApiKeySchema,
        ComboSchema,
        KvEntrySchema,
        UsageHistorySchema,
        UsageDailySchema,
        RequestDetailSchema,
        SessionAffinitySchema,
        ComboAffinitySchema,
        MetaSchema,
        ChatSessionSchema,
      ];
      expect(schemas).toHaveLength(14);
      for (const schema of schemas) {
        expect(schema).toBeDefined();
      }
      expect(ChatMessageSchema).toBeDefined();
    });
  });

  describe("Index definitions & Constraints", () => {
    it("configures unique index on ApiKey.key", () => {
      const path = ApiKeySchema.path("key");
      expect(path.options.unique).toBe(true);
      expect(path.options.required).toBe(true);
    });

    it("configures unique index on Combo.name", () => {
      const path = ComboSchema.path("name");
      expect(path.options.unique).toBe(true);
      expect(path.options.required).toBe(true);
    });

    it("configures unique compound index on KvEntry.{scope, key}", () => {
      const indexes = KvEntrySchema.indexes();
      const compoundUnique = indexes.find(
        ([fields, opts]) => fields.scope === 1 && fields.key === 1 && opts?.unique === true
      );
      expect(compoundUnique).toBeDefined();
    });

    it("configures unique index on Meta.key", () => {
      const path = MetaSchema.path("key");
      expect(path.options.unique).toBe(true);
      expect(path.options.required).toBe(true);
    });

    it("configures unique index on UsageDaily.dateKey", () => {
      const path = UsageDailySchema.path("dateKey");
      expect(path.options.unique).toBe(true);
      expect(path.options.required).toBe(true);
    });

    it("configures TTL index on SessionAffinity.updatedAt (expireAfterSeconds: 1800)", () => {
      const indexes = SessionAffinitySchema.indexes();
      const ttlIndex = indexes.find(
        ([fields, opts]) => fields.updatedAt === 1 && opts?.expireAfterSeconds === 1800
      );
      expect(ttlIndex).toBeDefined();
    });

    it("configures unique compound index on SessionAffinity.{provider, model, cacheKeyHash}", () => {
      const indexes = SessionAffinitySchema.indexes();
      const uniqueCompound = indexes.find(
        ([fields, opts]) =>
          fields.provider === 1 &&
          fields.model === 1 &&
          fields.cacheKeyHash === 1 &&
          opts?.unique === true
      );
      expect(uniqueCompound).toBeDefined();
    });

    it("configures TTL index on ComboAffinity.updatedAt (expireAfterSeconds: 1800)", () => {
      const indexes = ComboAffinitySchema.indexes();
      const ttlIndex = indexes.find(
        ([fields, opts]) => fields.updatedAt === 1 && opts?.expireAfterSeconds === 1800
      );
      expect(ttlIndex).toBeDefined();
    });

    it("configures unique compound index on ComboAffinity.{comboName, cacheKeyHash}", () => {
      const indexes = ComboAffinitySchema.indexes();
      const uniqueCompound = indexes.find(
        ([fields, opts]) =>
          fields.comboName === 1 && fields.cacheKeyHash === 1 && opts?.unique === true
      );
      expect(uniqueCompound).toBeDefined();
    });
    it("configures indexes on ChatSession.{updatedAt, createdAt}", () => {
      const indexes = ChatSessionSchema.indexes();
      const updatedAtIndex = indexes.find(
        ([fields]) => fields.updatedAt === -1
      );
      const createdAtIndex = indexes.find(
        ([fields]) => fields.createdAt === -1
      );
      expect(updatedAtIndex).toBeDefined();
      expect(createdAtIndex).toBeDefined();
    });
  });

  describe("Model Instantiation and Defaults", () => {
    it("instantiates Setting with default _id 'global' and default data", () => {
      const doc = new Setting();
      expect(doc._id).toBe("global");
      expect(doc.data).toEqual({ agentMetadataKeys: ["os", "hostname", "agent-name"] });
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it("instantiates ProviderConnection with UUIDv4 _id and defaults", () => {
      const doc = new ProviderConnection({ provider: "anthropic" });
      expect(doc._id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(doc.provider).toBe("anthropic");
      expect(doc.authType).toBe("oauth");
      expect(doc.isActive).toBe(true);
      expect(doc.priority).toBe(0);
      expect(doc.data).toEqual({});
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it("instantiates ProviderNode with UUIDv4 _id and defaults", () => {
      const doc = new ProviderNode({ type: "openai-compatible", name: "Custom Node" });
      expect(doc._id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(doc.type).toBe("openai-compatible");
      expect(doc.name).toBe("Custom Node");
      expect(doc.data).toEqual({});
    });

    it("instantiates ProxyPool with UUIDv4 _id and defaults", () => {
      const doc = new ProxyPool({ proxyUrl: "http://proxy.local:8080" });
      expect(doc._id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(doc.isActive).toBe(true);
      expect(doc.testStatus).toBe("unknown");
      expect(doc.data).toEqual({});
    });

    it("instantiates ApiKey with UUIDv4 _id and defaults", () => {
      const doc = new ApiKey({ key: "9r-secret-123", name: "dev-key" });
      expect(doc._id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(doc.key).toBe("9r-secret-123");
      expect(doc.name).toBe("dev-key");
      expect(doc.isActive).toBe(true);
      expect(doc.createdAt).toBeInstanceOf(Date);
    });

    it("instantiates Combo with UUIDv4 _id and defaults", () => {
      const doc = new Combo({ name: "smart-fallback" });
      expect(doc._id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(doc.name).toBe("smart-fallback");
      expect(doc.models).toEqual([]);
      expect(doc.defaultEffort).toBeNull();
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it("instantiates KvEntry with scope, key and value", () => {
      const doc = new KvEntry({
        scope: "modelAliases",
        key: "gpt-4o",
        value: "claude-3-5-sonnet",
      });
      expect(doc.scope).toBe("modelAliases");
      expect(doc.key).toBe("gpt-4o");
      expect(doc.value).toBe("claude-3-5-sonnet");
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it("instantiates Meta with key and value", () => {
      const doc = new Meta({ key: "schema_version", value: 1 });
      expect(doc.key).toBe("schema_version");
      expect(doc.value).toBe(1);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it("instantiates UsageHistory with defaults", () => {
      const ts = new Date();
      const doc = new UsageHistory({
        timestamp: ts,
        provider: "anthropic",
        model: "claude-3-5-sonnet",
      });
      expect(doc.timestamp).toEqual(ts);
      expect(doc.promptTokens).toBe(0);
      expect(doc.completionTokens).toBe(0);
      expect(doc.cost).toBe(0);
    });

    it("instantiates UsageDaily with defaults", () => {
      const doc = new UsageDaily({ dateKey: "2026-08-22" });
      expect(doc.dateKey).toBe("2026-08-22");
      expect(doc.requests).toBe(0);
      expect(doc.promptTokens).toBe(0);
      expect(doc.completionTokens).toBe(0);
      expect(doc.cost).toBe(0);
      expect(doc.byProvider).toEqual({});
      expect(doc.byModel).toEqual({});
      expect(doc.byAccount).toEqual({});
      expect(doc.byApiKey).toEqual({});
      expect(doc.byEndpoint).toEqual({});
    });

    it("instantiates RequestDetail with UUID _id and defaults", () => {
      const ts = new Date();
      const doc = new RequestDetail({
        timestamp: ts,
        provider: "openai",
        model: "gpt-4o",
      });
      expect(doc._id).toBeDefined();
      expect(String(doc._id)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(doc.timestamp).toEqual(ts);
      expect(doc.data).toEqual({});
    });

    it("instantiates SessionAffinity with defaults", () => {
      const doc = new SessionAffinity({
        provider: "google",
        model: "gemini-1.5-pro",
        cacheKeyHash: "hash123",
        connectionId: "conn-1",
      });
      expect(doc.provider).toBe("google");
      expect(doc.model).toBe("gemini-1.5-pro");
      expect(doc.cacheKeyHash).toBe("hash123");
      expect(doc.connectionId).toBe("conn-1");
      expect(doc.hitCount).toBe(1);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it("instantiates ComboAffinity with defaults", () => {
      const doc = new ComboAffinity({
        comboName: "combo-1",
        cacheKeyHash: "hash456",
        selectedModel: "anthropic/claude-3-5-sonnet",
      });
      expect(doc.comboName).toBe("combo-1");
      expect(doc.cacheKeyHash).toBe("hash456");
      expect(doc.selectedModel).toBe("anthropic/claude-3-5-sonnet");
      expect(doc.hitCount).toBe(1);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });
    it("instantiates ChatSession with UUIDv4 _id, defaults, and subdocument messages", () => {
      const doc = new ChatSession({
        modelId: "gpt-4o",
        providerId: "openai",
        messages: [
          {
            role: "user",
            content: "Hello world",
            attachments: [
              {
                name: "image.png",
                type: "image/png",
                dataUrl: "data:image/png;base64,123",
              },
            ],
          },
        ],
      });
      expect(doc._id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(doc.title).toBe("New chat");
      expect(doc.modelId).toBe("gpt-4o");
      expect(doc.providerId).toBe("openai");
      expect(doc.systemPrompt).toBeNull();
      expect(doc.messages).toHaveLength(1);
      expect(doc.messages[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(doc.messages[0].parentId).toBeNull();
      expect(doc.messages[0].role).toBe("user");
      expect(doc.messages[0].content).toBe("Hello world");
      expect(doc.messages[0].attachments).toHaveLength(1);
      expect(doc.messages[0].attachments[0].name).toBe("image.png");
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });
  });
});
