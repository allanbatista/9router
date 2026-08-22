#!/usr/bin/env node
/**
 * migrate-sqlite-to-mongo.mjs
 * Offline on-demand migration utility to import SQLite data.sqlite or JSON backup files into MongoDB.
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-mongo.mjs --sqlite <path-to-data.sqlite> [--mongo <mongodb-uri>] [--db <db-name>]
 *   node scripts/migrate-sqlite-to-mongo.mjs --json <path-to-backup.json> [--mongo <mongodb-uri>] [--db <db-name>]
 */

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import initSqlJs from "sql.js";

import { Setting } from "../src/lib/db/models/Setting.js";
import { ProviderConnection } from "../src/lib/db/models/ProviderConnection.js";
import { ProviderNode } from "../src/lib/db/models/ProviderNode.js";
import { ProxyPool } from "../src/lib/db/models/ProxyPool.js";
import { ApiKey } from "../src/lib/db/models/ApiKey.js";
import { Combo } from "../src/lib/db/models/Combo.js";
import { KvEntry } from "../src/lib/db/models/KvEntry.js";
import { UsageHistory } from "../src/lib/db/models/UsageHistory.js";
import { UsageDaily } from "../src/lib/db/models/UsageDaily.js";
import { RequestDetail } from "../src/lib/db/models/RequestDetail.js";
import { SessionAffinity } from "../src/lib/db/models/SessionAffinity.js";
import { ComboAffinity } from "../src/lib/db/models/ComboAffinity.js";
import { Meta } from "../src/lib/db/models/Meta.js";

function parseJson(str, fallback = null) {
  if (typeof str !== "string" || !str.trim()) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function parseArgs(args = process.argv.slice(2)) {
  const options = {
    sqlitePath: null,
    jsonPath: null,
    mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:29017/9router",
    dbName: process.env.MONGODB_DB_NAME || undefined,
    dryRun: false,
    wipe: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--sqlite" || arg === "-s") {
      options.sqlitePath = args[++i];
    } else if (arg === "--json" || arg === "-j") {
      options.jsonPath = args[++i];
    } else if (arg === "--mongo" || arg === "-m" || arg === "--uri") {
      options.mongoUri = args[++i];
    } else if (arg === "--db" || arg === "-d") {
      options.dbName = args[++i];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--wipe") {
      options.wipe = true;
    }
  }

  return options;
}

export async function readSqliteData(sqlitePath) {
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database file not found: ${sqlitePath}`);
  }

  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(sqlitePath);
  const db = new SQL.Database(fileBuffer);

  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const tables = tablesRes.length > 0 ? tablesRes[0].values.map((v) => v[0]) : [];

  const data = {};

  for (const table of tables) {
    try {
      const res = db.exec(`SELECT * FROM "${table}"`);
      if (res.length === 0) {
        data[table] = [];
        continue;
      }
      const columns = res[0].columns;
      const rows = res[0].values.map((row) => {
        const obj = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });
      data[table] = rows;
    } catch (err) {
      console.warn(`[Migrate] Warning: Failed to read table ${table}: ${err.message}`);
      data[table] = [];
    }
  }

  db.close();
  return data;
}

export async function migrateFromSqliteData(sqliteData, { dryRun = false } = {}) {
  const summary = {
    settings: 0,
    providerConnections: 0,
    providerNodes: 0,
    proxyPools: 0,
    apiKeys: 0,
    combos: 0,
    kv: 0,
    usageHistory: 0,
    usageDaily: 0,
    requestDetails: 0,
    sessionAffinity: 0,
    comboAffinity: 0,
    meta: 0,
  };

  // 1. Settings
  const settingsRows = sqliteData.settings || [];
  if (settingsRows.length > 0) {
    const raw = settingsRows[0];
    const parsedData = parseJson(raw.data, {});
    if (!dryRun) {
      await Setting.findOneAndUpdate(
        { _id: "global" },
        { $set: { data: parsedData, updatedAt: new Date() } },
        { upsert: true }
      );
    }
    summary.settings = 1;
  }

  // 2. Provider Connections
  const connRows = sqliteData.providerConnections || [];
  if (connRows.length > 0) {
    const docs = connRows.map((r) => {
      const extra = parseJson(r.data, {});
      return {
        _id: r.id,
        provider: r.provider,
        authType: r.authType || "oauth",
        name: r.name ?? null,
        email: r.email ?? null,
        priority: r.priority !== null && r.priority !== undefined ? Number(r.priority) : null,
        isActive: r.isActive === 1 || r.isActive === true || r.isActive === "1",
        data: extra,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
      };
    });
    if (!dryRun) {
      for (const doc of docs) {
        await ProviderConnection.findOneAndUpdate({ _id: doc._id }, { $set: doc }, { upsert: true });
      }
    }
    summary.providerConnections = docs.length;
  }

  // 3. Provider Nodes
  const nodeRows = sqliteData.providerNodes || [];
  if (nodeRows.length > 0) {
    const docs = nodeRows.map((r) => {
      const extra = parseJson(r.data, {});
      return {
        _id: r.id,
        type: r.type ?? null,
        name: r.name ?? null,
        prefix: r.prefix ?? null,
        apiType: r.apiType ?? null,
        baseUrl: r.baseUrl ?? null,
        data: extra,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
      };
    });
    if (!dryRun) {
      for (const doc of docs) {
        await ProviderNode.findOneAndUpdate({ _id: doc._id }, { $set: doc }, { upsert: true });
      }
    }
    summary.providerNodes = docs.length;
  }

  // 4. Proxy Pools
  const poolRows = sqliteData.proxyPools || [];
  if (poolRows.length > 0) {
    const docs = poolRows.map((r) => {
      const extra = parseJson(r.data, {});
      return {
        _id: r.id,
        name: r.name ?? null,
        proxyUrl: r.proxyUrl ?? null,
        isActive: r.isActive === 1 || r.isActive === true || r.isActive === "1",
        testStatus: r.testStatus || "unknown",
        data: extra,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
      };
    });
    if (!dryRun) {
      for (const doc of docs) {
        await ProxyPool.findOneAndUpdate({ _id: doc._id }, { $set: doc }, { upsert: true });
      }
    }
    summary.proxyPools = docs.length;
  }

  // 5. API Keys
  const keyRows = sqliteData.apiKeys || [];
  if (keyRows.length > 0) {
    const docs = keyRows.map((r) => ({
      _id: r.id,
      key: r.key,
      name: r.name ?? null,
      machineId: r.machineId ?? null,
      isActive: r.isActive === 1 || r.isActive === true || r.isActive === "1",
      createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    }));
    if (!dryRun) {
      for (const doc of docs) {
        await ApiKey.findOneAndUpdate({ _id: doc._id }, { $set: doc }, { upsert: true });
      }
    }
    summary.apiKeys = docs.length;
  }

  // 6. Combos
  const comboRows = sqliteData.combos || [];
  if (comboRows.length > 0) {
    const docs = comboRows.map((r) => ({
      _id: r.id,
      name: r.name,
      kind: r.kind ?? null,
      models: parseJson(r.models, []),
      createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
    }));
    if (!dryRun) {
      for (const doc of docs) {
        await Combo.findOneAndUpdate({ _id: doc._id }, { $set: doc }, { upsert: true });
      }
    }
    summary.combos = docs.length;
  }

  // 7. KV
  const kvRows = sqliteData.kv || [];
  if (kvRows.length > 0) {
    const docs = kvRows.map((r) => ({
      scope: r.scope,
      key: r.key,
      value: parseJson(r.value, r.value),
      updatedAt: new Date(),
    }));
    if (!dryRun) {
      for (const doc of docs) {
        await KvEntry.findOneAndUpdate(
          { scope: doc.scope, key: doc.key },
          { $set: doc },
          { upsert: true }
        );
      }
    }
    summary.kv = docs.length;
  }

  // 8. Usage History
  const historyRows = sqliteData.usageHistory || [];
  if (historyRows.length > 0) {
    const docs = historyRows.map((r) => ({
      timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
      provider: r.provider || null,
      model: r.model || null,
      connectionId: r.connectionId || null,
      apiKey: r.apiKey || null,
      endpoint: r.endpoint || null,
      promptTokens: Number(r.promptTokens || 0),
      completionTokens: Number(r.completionTokens || 0),
      cost: Number(r.cost || 0),
      status: r.status || "ok",
      tokens: parseJson(r.tokens, {}),
      meta: parseJson(r.meta, {}),
    }));
    if (!dryRun && docs.length > 0) {
      await UsageHistory.insertMany(docs, { ordered: false });
    }
    summary.usageHistory = docs.length;
  }

  // 9. Usage Daily
  const dailyRows = sqliteData.usageDaily || [];
  if (dailyRows.length > 0) {
    const docs = dailyRows.map((r) => {
      const d = parseJson(r.data, {});
      return {
        dateKey: r.dateKey,
        requests: Number(d.requests || 0),
        promptTokens: Number(d.promptTokens || 0),
        completionTokens: Number(d.completionTokens || 0),
        cost: Number(d.cost || 0),
        byProvider: d.byProvider || {},
        byModel: d.byModel || {},
        byAccount: d.byAccount || {},
        byApiKey: d.byApiKey || {},
        byEndpoint: d.byEndpoint || {},
      };
    });
    if (!dryRun) {
      for (const doc of docs) {
        await UsageDaily.findOneAndUpdate({ dateKey: doc.dateKey }, { $set: doc }, { upsert: true });
      }
    }
    summary.usageDaily = docs.length;
  }

  // 10. Request Details
  const detailRows = sqliteData.requestDetails || [];
  if (detailRows.length > 0) {
    const docs = detailRows.map((r) => ({
      _id: r.id,
      timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
      provider: r.provider || null,
      model: r.model || null,
      connectionId: r.connectionId || null,
      status: r.status || null,
      data: parseJson(r.data, {}),
    }));
    if (!dryRun && docs.length > 0) {
      await RequestDetail.insertMany(docs, { ordered: false });
    }
    summary.requestDetails = docs.length;
  }

  // 11. Session Affinity
  const sessionRows = sqliteData.sessionAffinity || [];
  if (sessionRows.length > 0) {
    const docs = sessionRows.map((r) => ({
      provider: r.provider,
      model: r.model,
      cacheKeyHash: r.cacheKeyHash,
      rawKey: r.rawKey,
      connectionId: r.connectionId,
      hitCount: Number(r.hitCount || 1),
      updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
    }));
    if (!dryRun) {
      for (const doc of docs) {
        await SessionAffinity.findOneAndUpdate(
          { provider: doc.provider, model: doc.model, cacheKeyHash: doc.cacheKeyHash },
          { $set: doc },
          { upsert: true }
        );
      }
    }
    summary.sessionAffinity = docs.length;
  }

  // 12. Combo Affinity
  const comboAffRows = sqliteData.comboAffinity || [];
  if (comboAffRows.length > 0) {
    const docs = comboAffRows.map((r) => ({
      comboName: r.comboName,
      cacheKeyHash: r.cacheKeyHash,
      rawKey: r.rawKey,
      selectedModel: r.selectedModel,
      hitCount: Number(r.hitCount || 1),
      updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
    }));
    if (!dryRun) {
      for (const doc of docs) {
        await ComboAffinity.findOneAndUpdate(
          { comboName: doc.comboName, cacheKeyHash: doc.cacheKeyHash },
          { $set: doc },
          { upsert: true }
        );
      }
    }
    summary.comboAffinity = docs.length;
  }

  // 13. Meta
  const metaRows = sqliteData._meta || [];
  if (metaRows.length > 0) {
    const docs = metaRows.map((r) => ({
      key: r.key,
      value: parseJson(r.value, r.value),
      updatedAt: new Date(),
    }));
    if (!dryRun) {
      for (const doc of docs) {
        await Meta.findOneAndUpdate({ key: doc.key }, { $set: doc }, { upsert: true });
      }
    }
    summary.meta = docs.length;
  }

  return summary;
}

export async function migrateFromJsonFile(jsonPath, { dryRun = false } = {}) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON file not found: ${jsonPath}`);
  }
  const content = fs.readFileSync(jsonPath, "utf-8");
  const payload = JSON.parse(content);
  const { importDb } = await import("../src/lib/db/index.js");

  if (!dryRun) {
    await importDb(payload);
  }

  return {
    settings: payload.settings ? 1 : 0,
    providerConnections: payload.providerConnections?.length || 0,
    providerNodes: payload.providerNodes?.length || 0,
    proxyPools: payload.proxyPools?.length || 0,
    apiKeys: payload.apiKeys?.length || 0,
    combos: payload.combos?.length || 0,
    modelAliases: Object.keys(payload.modelAliases || {}).length,
    customModels: payload.customModels?.length || 0,
    mitmAlias: Object.keys(payload.mitmAlias || {}).length,
    pricing: Object.keys(payload.pricing || {}).length,
  };
}

export async function main() {
  const options = parseArgs();

  if (!options.sqlitePath && !options.jsonPath) {
    console.error("Error: Please provide either --sqlite <path> or --json <path>");
    console.error("Usage:");
    console.error("  node scripts/migrate-sqlite-to-mongo.mjs --sqlite ./data.sqlite");
    console.error("  node scripts/migrate-sqlite-to-mongo.mjs --json ./backup.json");
    process.exit(1);
  }

  console.log(`[Migrate] Connecting to MongoDB at ${options.mongoUri}...`);
  const connOpts = {
    serverSelectionTimeoutMS: 5000,
  };
  if (options.dbName) {
    connOpts.dbName = options.dbName;
  }
  await mongoose.connect(options.mongoUri, connOpts);
  console.log(`[Migrate] Connected to MongoDB successfully.`);

  if (options.wipe) {
    console.log(`[Migrate] Wiping existing collections...`);
    await Promise.all([
      Setting.deleteMany({}),
      ProviderConnection.deleteMany({}),
      ProviderNode.deleteMany({}),
      ProxyPool.deleteMany({}),
      ApiKey.deleteMany({}),
      Combo.deleteMany({}),
      KvEntry.deleteMany({}),
      UsageHistory.deleteMany({}),
      UsageDaily.deleteMany({}),
      RequestDetail.deleteMany({}),
      SessionAffinity.deleteMany({}),
      ComboAffinity.deleteMany({}),
      Meta.deleteMany({}),
    ]);
  }

  let summary = null;
  const startTime = Date.now();

  if (options.sqlitePath) {
    console.log(`[Migrate] Reading SQLite database from ${options.sqlitePath}...`);
    const sqliteData = await readSqliteData(options.sqlitePath);
    console.log(`[Migrate] Migrating records into MongoDB collections (dryRun=${options.dryRun})...`);
    summary = await migrateFromSqliteData(sqliteData, { dryRun: options.dryRun });
  } else if (options.jsonPath) {
    console.log(`[Migrate] Reading JSON backup from ${options.jsonPath}...`);
    summary = await migrateFromJsonFile(options.jsonPath, { dryRun: options.dryRun });
  }

  const durationMs = Date.now() - startTime;
  console.log(`\n================ Migration Summary (${durationMs}ms) ================`);
  for (const [entity, count] of Object.entries(summary || {})) {
    console.log(`  - ${entity.padEnd(22)}: ${count} record(s)`);
  }
  console.log(`========================================================\n`);

  await mongoose.disconnect();
  console.log(`[Migrate] Migration finished successfully.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((err) => {
    console.error(`[Migrate] Migration failed:`, err);
    process.exit(1);
  });
}
