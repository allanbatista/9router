import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import initSqlJs from "sql.js";
import {
  parseArgs,
  readSqliteData,
  migrateFromSqliteData,
  migrateFromJsonFile,
} from "../../scripts/migrate-sqlite-to-mongo.mjs";

import { Setting } from "../../src/lib/db/models/Setting.js";
import { ProviderConnection } from "../../src/lib/db/models/ProviderConnection.js";
import { ProviderNode } from "../../src/lib/db/models/ProviderNode.js";
import { ProxyPool } from "../../src/lib/db/models/ProxyPool.js";
import { ApiKey } from "../../src/lib/db/models/ApiKey.js";
import { Combo } from "../../src/lib/db/models/Combo.js";
import { KvEntry } from "../../src/lib/db/models/KvEntry.js";
import { UsageHistory } from "../../src/lib/db/models/UsageHistory.js";
import { UsageDaily } from "../../src/lib/db/models/UsageDaily.js";
import { RequestDetail } from "../../src/lib/db/models/RequestDetail.js";
import { SessionAffinity } from "../../src/lib/db/models/SessionAffinity.js";
import { ComboAffinity } from "../../src/lib/db/models/ComboAffinity.js";
import { Meta } from "../../src/lib/db/models/Meta.js";
import { ChatSession } from "../../src/lib/db/models/ChatSession.js";

vi.mock("../../src/lib/db/connection.js", () => ({
  getConnection: vi.fn().mockResolvedValue({ connection: { readyState: 1 } }),
  disconnectDb: vi.fn().mockResolvedValue(),
  getMongoConfig: vi.fn().mockReturnValue({ uri: "mongodb://127.0.0.1:27017/9router" }),
}));

// Mock collections store
class MockDbStore {
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
    q.sort = () => q;
    return q;
  }

  find(query = {}) {
    return this._makeQuery(
      (async () => {
        const results = [];
        for (const doc of this.docs.values()) {
          let match = true;
          for (const [k, v] of Object.entries(query)) {
            if (k === "scope" && v && typeof v === "object" && Array.isArray(v.$in)) {
              if (!v.$in.includes(doc.scope)) {
                match = false;
                break;
              }
            } else if (doc[k] !== v) {
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
        const doc = this.docs.get(id);
        return this._clone(doc);
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

  async findOneAndUpdate(query, update, options = {}) {
    let key = query._id || query.key || query.dateKey || (query.scope && query.key ? `${query.scope}:${query.key}` : null);
    if (!key && query.provider && query.model && query.cacheKeyHash) {
      key = `${query.provider}:${query.model}:${query.cacheKeyHash}`;
    }
    if (!key && query.comboName && query.cacheKeyHash) {
      key = `${query.comboName}:${query.cacheKeyHash}`;
    }

    let doc = key ? this.docs.get(key) : null;
    if (!doc && options.upsert) {
      doc = { ...query };
      if (!key) key = Math.random().toString();
      doc._id = query._id || key;
    }

    if (doc) {
      if (update.$set) {
        Object.assign(doc, update.$set);
      } else {
        Object.assign(doc, update);
      }
      this.docs.set(key, this._clone(doc));
      return this._clone(doc);
    }
    return null;
  }

  async insertMany(docs = []) {
    for (const d of docs) {
      const key = d._id || (d.scope && d.key ? `${d.scope}:${d.key}` : Math.random().toString());
      this.docs.set(key, this._clone(d));
    }
    return docs;
  }

  async deleteMany(query = {}) {
    if (Object.keys(query).length === 0) {
      this.docs.clear();
      return { deletedCount: this.docs.size };
    }
    let count = 0;
    for (const [k, doc] of this.docs.entries()) {
      let match = true;
      for (const [qk, qv] of Object.entries(query)) {
        if (qk === "scope" && qv && typeof qv === "object" && Array.isArray(qv.$in)) {
          if (!qv.$in.includes(doc.scope)) {
            match = false;
            break;
          }
        } else if (doc[qk] !== qv) {
          match = false;
          break;
        }
      }
      if (match) {
        this.docs.delete(k);
        count++;
      }
    }
    return { deletedCount: count };
  }
}
const mockStores = {
  Setting: new MockDbStore(),
  ProviderConnection: new MockDbStore(),
  ProviderNode: new MockDbStore(),
  ProxyPool: new MockDbStore(),
  ApiKey: new MockDbStore(),
  Combo: new MockDbStore(),
  KvEntry: new MockDbStore(),
  UsageHistory: new MockDbStore(),
  UsageDaily: new MockDbStore(),
  RequestDetail: new MockDbStore(),
  SessionAffinity: new MockDbStore(),
  ComboAffinity: new MockDbStore(),
  Meta: new MockDbStore(),
  ChatSession: new MockDbStore(),
};

describe("SQLite to MongoDB Migration CLI (V9)", () => {
  let tempDir;
  let sqliteFile;
  let jsonFile;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9r-migrate-test-"));
    sqliteFile = path.join(tempDir, "test-data.sqlite");
    jsonFile = path.join(tempDir, "test-backup.json");

    for (const store of Object.values(mockStores)) {
      store.clear();
    }

    // Bind mocks to models
    Setting.find = (...args) => mockStores.Setting.find(...args);
    Setting.findById = (...args) => mockStores.Setting.findById(...args);
    Setting.findOneAndUpdate = (...args) => mockStores.Setting.findOneAndUpdate(...args);
    Setting.deleteMany = (...args) => mockStores.Setting.deleteMany(...args);

    ProviderConnection.find = (...args) => mockStores.ProviderConnection.find(...args);
    ProviderConnection.findById = (...args) => mockStores.ProviderConnection.findById(...args);
    ProviderConnection.findOneAndUpdate = (...args) => mockStores.ProviderConnection.findOneAndUpdate(...args);
    ProviderConnection.insertMany = (...args) => mockStores.ProviderConnection.insertMany(...args);
    ProviderConnection.deleteMany = (...args) => mockStores.ProviderConnection.deleteMany(...args);

    ProviderNode.find = (...args) => mockStores.ProviderNode.find(...args);
    ProviderNode.findById = (...args) => mockStores.ProviderNode.findById(...args);
    ProviderNode.findOneAndUpdate = (...args) => mockStores.ProviderNode.findOneAndUpdate(...args);
    ProviderNode.insertMany = (...args) => mockStores.ProviderNode.insertMany(...args);
    ProviderNode.deleteMany = (...args) => mockStores.ProviderNode.deleteMany(...args);

    ProxyPool.find = (...args) => mockStores.ProxyPool.find(...args);
    ProxyPool.findById = (...args) => mockStores.ProxyPool.findById(...args);
    ProxyPool.findOneAndUpdate = (...args) => mockStores.ProxyPool.findOneAndUpdate(...args);
    ProxyPool.insertMany = (...args) => mockStores.ProxyPool.insertMany(...args);
    ProxyPool.deleteMany = (...args) => mockStores.ProxyPool.deleteMany(...args);

    ApiKey.find = (...args) => mockStores.ApiKey.find(...args);
    ApiKey.findById = (...args) => mockStores.ApiKey.findById(...args);
    ApiKey.findOneAndUpdate = (...args) => mockStores.ApiKey.findOneAndUpdate(...args);
    ApiKey.insertMany = (...args) => mockStores.ApiKey.insertMany(...args);
    ApiKey.deleteMany = (...args) => mockStores.ApiKey.deleteMany(...args);

    Combo.find = (...args) => mockStores.Combo.find(...args);
    Combo.findById = (...args) => mockStores.Combo.findById(...args);
    Combo.findOneAndUpdate = (...args) => mockStores.Combo.findOneAndUpdate(...args);
    Combo.insertMany = (...args) => mockStores.Combo.insertMany(...args);
    Combo.deleteMany = (...args) => mockStores.Combo.deleteMany(...args);

    KvEntry.find = (...args) => mockStores.KvEntry.find(...args);
    KvEntry.findById = (...args) => mockStores.KvEntry.findById(...args);
    KvEntry.findOne = (...args) => mockStores.KvEntry.findOne(...args);
    KvEntry.findOneAndUpdate = (...args) => mockStores.KvEntry.findOneAndUpdate(...args);
    KvEntry.insertMany = (...args) => mockStores.KvEntry.insertMany(...args);
    KvEntry.deleteMany = (...args) => mockStores.KvEntry.deleteMany(...args);

    UsageHistory.insertMany = (...args) => mockStores.UsageHistory.insertMany(...args);
    UsageDaily.findOneAndUpdate = (...args) => mockStores.UsageDaily.findOneAndUpdate(...args);
    RequestDetail.insertMany = (...args) => mockStores.RequestDetail.insertMany(...args);
    SessionAffinity.findOneAndUpdate = (...args) => mockStores.SessionAffinity.findOneAndUpdate(...args);
    ComboAffinity.findOneAndUpdate = (...args) => mockStores.ComboAffinity.findOneAndUpdate(...args);
    Meta.findOneAndUpdate = (...args) => mockStores.Meta.findOneAndUpdate(...args);
    ChatSession.find = (...args) => mockStores.ChatSession.find(...args);
    ChatSession.findById = (...args) => mockStores.ChatSession.findById(...args);
    ChatSession.findOneAndUpdate = (...args) => mockStores.ChatSession.findOneAndUpdate(...args);
    ChatSession.insertMany = (...args) => mockStores.ChatSession.insertMany(...args);
    ChatSession.deleteMany = (...args) => mockStores.ChatSession.deleteMany(...args);
  });
  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("parses CLI arguments correctly", () => {
    const opts1 = parseArgs(["--sqlite", "./data.sqlite", "--mongo", "mongodb://atlas:27017/prod", "--db", "customDb"]);
    expect(opts1.sqlitePath).toBe("./data.sqlite");
    expect(opts1.mongoUri).toBe("mongodb://atlas:27017/prod");
    expect(opts1.dbName).toBe("customDb");
    expect(opts1.dryRun).toBe(false);

    const opts2 = parseArgs(["-j", "./backup.json", "--dry-run", "--wipe"]);
    expect(opts2.jsonPath).toBe("./backup.json");
    expect(opts2.dryRun).toBe(true);
    expect(opts2.wipe).toBe(true);
  });

  it("reads tables and records from SQLite database file", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.exec(`
      CREATE TABLE settings (id INTEGER PRIMARY KEY, data TEXT);
      INSERT INTO settings VALUES (1, '{"cloudEnabled":true,"theme":"dark"}');

      CREATE TABLE apiKeys (id TEXT PRIMARY KEY, key TEXT, name TEXT, machineId TEXT, isActive INTEGER, createdAt TEXT);
      INSERT INTO apiKeys VALUES ('key-1', '9r-live-key1', 'Primary Key', 'mach-1', 1, '2026-08-20T00:00:00.000Z');

      CREATE TABLE kv (scope TEXT, key TEXT, value TEXT, PRIMARY KEY (scope, key));
      INSERT INTO kv VALUES ('modelAliases', 'gpt', '"gpt-4o"');
    `);

    const data = db.export();
    fs.writeFileSync(sqliteFile, Buffer.from(data));
    db.close();

    const result = await readSqliteData(sqliteFile);
    expect(result).toBeDefined();
    expect(result.settings).toHaveLength(1);
    expect(result.apiKeys).toHaveLength(1);
    expect(result.kv).toHaveLength(1);
  });

  it("migrates full SQLite schema data into MongoDB collections", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.exec(`
      CREATE TABLE settings (id INTEGER PRIMARY KEY, data TEXT);
      INSERT INTO settings VALUES (1, '{"cloudEnabled":true}');

      CREATE TABLE providerConnections (id TEXT PRIMARY KEY, provider TEXT, authType TEXT, name TEXT, email TEXT, priority INTEGER, isActive INTEGER, data TEXT, createdAt TEXT, updatedAt TEXT);
      INSERT INTO providerConnections VALUES ('conn-1', 'openai', 'apikey', 'OpenAI', NULL, 1, 1, '{"apiKey":"sk-123"}', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z');

      CREATE TABLE providerNodes (id TEXT PRIMARY KEY, type TEXT, name TEXT, data TEXT, createdAt TEXT, updatedAt TEXT);
      INSERT INTO providerNodes VALUES ('node-1', 'custom', 'Node 1', '{"baseUrl":"http://localhost:11434"}', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z');

      CREATE TABLE proxyPools (id TEXT PRIMARY KEY, isActive INTEGER, testStatus TEXT, data TEXT, createdAt TEXT, updatedAt TEXT);
      INSERT INTO proxyPools VALUES ('pool-1', 1, 'healthy', '{"proxyUrl":"http://proxy:8080"}', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z');

      CREATE TABLE apiKeys (id TEXT PRIMARY KEY, key TEXT, name TEXT, machineId TEXT, isActive INTEGER, createdAt TEXT);
      INSERT INTO apiKeys VALUES ('key-1', '9r-test-key', 'Test Key', 'mach-1', 1, '2026-08-20T00:00:00.000Z');

      CREATE TABLE combos (id TEXT PRIMARY KEY, name TEXT, kind TEXT, models TEXT, defaultEffort TEXT, createdAt TEXT, updatedAt TEXT);
      INSERT INTO combos VALUES ('combo-1', 'dual-fallback', 'fallback', '[{"provider":"openai","model":"gpt-4o"}]', 'high', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z');

      CREATE TABLE kv (scope TEXT, key TEXT, value TEXT, PRIMARY KEY (scope, key));
      INSERT INTO kv VALUES ('modelAliases', 'alias-1', '"model-target"');
      INSERT INTO kv VALUES ('pricing', 'openai', '{"gpt-4o":{"prompt":5,"completion":15}}');

      CREATE TABLE usageHistory (id INTEGER PRIMARY KEY, timestamp TEXT, provider TEXT, model TEXT, connectionId TEXT, apiKey TEXT, endpoint TEXT, promptTokens INTEGER, completionTokens INTEGER, cost REAL, status TEXT, tokens TEXT, meta TEXT);
      INSERT INTO usageHistory VALUES (1, '2026-08-22T00:00:00.000Z', 'openai', 'gpt-4o', 'conn-1', 'key-1', '/v1/chat/completions', 100, 50, 0.002, 'ok', '{"prompt_tokens":100}', '{}');

      CREATE TABLE usageDaily (dateKey TEXT PRIMARY KEY, data TEXT);
      INSERT INTO usageDaily VALUES ('2026-08-22', '{"requests":1,"promptTokens":100,"completionTokens":50,"cost":0.002}');

      CREATE TABLE requestDetails (id TEXT PRIMARY KEY, timestamp TEXT, provider TEXT, model TEXT, connectionId TEXT, status TEXT, data TEXT);
      INSERT INTO requestDetails VALUES ('req-1', '2026-08-22T00:00:00.000Z', 'openai', 'gpt-4o', 'conn-1', 'ok', '{"model":"gpt-4o"}');

      CREATE TABLE sessionAffinity (provider TEXT, model TEXT, cacheKeyHash TEXT, rawKey TEXT, connectionId TEXT, updatedAt TEXT, hitCount INTEGER, PRIMARY KEY (provider, model, cacheKeyHash));
      INSERT INTO sessionAffinity VALUES ('openai', 'gpt-4o', 'hash-1', 'key-raw', 'conn-1', '2026-08-22T00:00:00.000Z', 5);

      CREATE TABLE comboAffinity (comboName TEXT, cacheKeyHash TEXT, rawKey TEXT, selectedModel TEXT, updatedAt TEXT, hitCount INTEGER, PRIMARY KEY (comboName, cacheKeyHash));
      INSERT INTO comboAffinity VALUES ('dual-fallback', 'hash-2', 'key-raw-2', 'gpt-4o', '2026-08-22T00:00:00.000Z', 3);

      CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO _meta VALUES ('schemaVersion', '5');
    `);

    const data = db.export();
    fs.writeFileSync(sqliteFile, Buffer.from(data));
    db.close();

    const sqliteData = await readSqliteData(sqliteFile);
    const summary = await migrateFromSqliteData(sqliteData, { dryRun: false });

    expect(summary.settings).toBe(1);
    expect(summary.providerConnections).toBe(1);
    expect(summary.providerNodes).toBe(1);
    expect(summary.proxyPools).toBe(1);
    expect(summary.apiKeys).toBe(1);
    expect(summary.combos).toBe(1);
    expect(summary.kv).toBe(2);
    expect(summary.usageHistory).toBe(1);
    expect(summary.usageDaily).toBe(1);
    expect(summary.requestDetails).toBe(1);
    expect(summary.sessionAffinity).toBe(1);
    expect(summary.comboAffinity).toBe(1);
    expect(summary.meta).toBe(1);

    // Verify stored records in mock collections
    expect(mockStores.Setting.docs.get("global")?.data).toEqual({ cloudEnabled: true });
    expect(mockStores.ProviderConnection.docs.get("conn-1")?.provider).toBe("openai");
    expect(mockStores.ProviderConnection.docs.get("conn-1")?.data).toEqual({ apiKey: "sk-123" });
    expect(mockStores.ApiKey.docs.get("key-1")?.key).toBe("9r-test-key");
    expect(mockStores.Combo.docs.get("combo-1")?.name).toBe("dual-fallback");
    expect(mockStores.Combo.docs.get("combo-1")?.defaultEffort).toBe("high");
    expect(mockStores.UsageDaily.docs.get("2026-08-22")?.promptTokens).toBe(100);
    expect(Number(mockStores.Meta.docs.get("schemaVersion")?.value)).toBe(5);
  });

  it("supports dry-run mode without modifying MongoDB collections", async () => {
    const sqliteData = {
      settings: [{ id: 1, data: '{"theme":"dark"}' }],
      apiKeys: [{ id: "key-dry", key: "9r-dry-key", name: "Dry", machineId: "m1", isActive: 1 }],
    };

    const summary = await migrateFromSqliteData(sqliteData, { dryRun: true });
    expect(summary.settings).toBe(1);
    expect(summary.apiKeys).toBe(1);

    expect(mockStores.Setting.docs.size).toBe(0);
    expect(mockStores.ApiKey.docs.size).toBe(0);
  });

  it("migrates directly from JSON backup file using migrateFromJsonFile", async () => {
    const backupJson = {
      settings: { cloudEnabled: true },
      providerConnections: [
        { id: "conn-json", provider: "google", authType: "oauth", name: "Gemini", priority: 1, isActive: true },
      ],
      apiKeys: [
        { id: "key-json", key: "9r-from-json", name: "JSON key", machineId: "m2", isActive: true },
      ],
      modelAliases: { "gemini": "gemini-1.5-pro" },
    };

    fs.writeFileSync(jsonFile, JSON.stringify(backupJson, null, 2));

    const summary = await migrateFromJsonFile(jsonFile, { dryRun: false });
    expect(summary.settings).toBe(1);
    expect(summary.providerConnections).toBe(1);
    expect(summary.apiKeys).toBe(1);
    expect(summary.modelAliases).toBe(1);
  });

  it("throws descriptive error when SQLite file is missing", async () => {
    await expect(readSqliteData("/non/existent/path/data.sqlite")).rejects.toThrow(
      "SQLite database file not found"
    );
  });
});
