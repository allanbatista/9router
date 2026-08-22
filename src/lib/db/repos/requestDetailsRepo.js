import mongoose from "mongoose";
import { getConnection } from "../connection.js";
import { RequestDetail } from "../models/RequestDetail.js";

const DEFAULT_MAX_RECORDS = 200;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_JSON_SIZE = 5 * 1024;
const CONFIG_CACHE_TTL_MS = 5000;

let cachedConfig = null;
let cachedConfigTs = 0;

async function getObservabilityConfig() {
  if (cachedConfig && (Date.now() - cachedConfigTs) < CONFIG_CACHE_TTL_MS) return cachedConfig;
  try {
    const { getSettings } = await import("./settingsRepo.js");
    const settings = await getSettings();
    const envRequestLogs = process.env.ENABLE_REQUEST_LOGS;
    if (envRequestLogs !== undefined) {
      const enabled = envRequestLogs.toLowerCase() === "true";
      cachedConfig = {
        enabled,
        maxRecords: settings.observabilityMaxRecords || parseInt(process.env.OBSERVABILITY_MAX_RECORDS || String(DEFAULT_MAX_RECORDS), 10),
        batchSize: settings.observabilityBatchSize || parseInt(process.env.OBSERVABILITY_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10),
        flushIntervalMs: settings.observabilityFlushIntervalMs || parseInt(process.env.OBSERVABILITY_FLUSH_INTERVAL_MS || String(DEFAULT_FLUSH_INTERVAL_MS), 10),
        maxJsonSize: (settings.observabilityMaxJsonSize || parseInt(process.env.OBSERVABILITY_MAX_JSON_SIZE || "5", 10)) * 1024,
      };
      cachedConfigTs = Date.now();
      return cachedConfig;
    }
    const envFallback = process.env.OBSERVABILITY_ENABLED !== "false";
    const uiFlag = typeof settings.enableObservability === "boolean";
    const enabled = uiFlag
      ? settings.enableObservability
      : envFallback;

    cachedConfig = {
      enabled,
      maxRecords: settings.observabilityMaxRecords || parseInt(process.env.OBSERVABILITY_MAX_RECORDS || String(DEFAULT_MAX_RECORDS), 10),
      batchSize: settings.observabilityBatchSize || parseInt(process.env.OBSERVABILITY_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10),
      flushIntervalMs: settings.observabilityFlushIntervalMs || parseInt(process.env.OBSERVABILITY_FLUSH_INTERVAL_MS || String(DEFAULT_FLUSH_INTERVAL_MS), 10),
      maxJsonSize: (settings.observabilityMaxJsonSize || parseInt(process.env.OBSERVABILITY_MAX_JSON_SIZE || "5", 10)) * 1024,
    };
  } catch {
    cachedConfig = {
      enabled: false,
      maxRecords: DEFAULT_MAX_RECORDS,
      batchSize: DEFAULT_BATCH_SIZE,
      flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
      maxJsonSize: DEFAULT_MAX_JSON_SIZE,
    };
  }
  cachedConfigTs = Date.now();
  return cachedConfig;
}

let writeBuffer = [];
let flushTimer = null;
let isFlushing = false;

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const sensitiveKeys = ["authorization", "x-api-key", "cookie", "token", "api-key"];
  const sanitized = { ...headers };
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) delete sanitized[key];
  }
  return sanitized;
}

export const __test__ = { sanitizeHeaders, getWriteBuffer: () => writeBuffer, clearWriteBuffer: () => { writeBuffer = []; } };

function generateDetailId() {
  return new mongoose.Types.ObjectId().toHexString();
}

function truncateField(obj, maxSize) {
  const str = JSON.stringify(obj || {});
  if (str.length > maxSize) {
    return { _truncated: true, _originalSize: str.length, _preview: str.substring(0, 200) };
  }
  return obj || {};
}

function is4xxStatus(status) {
  if (status == null) return false;
  const s = String(status).trim();
  const n = parseInt(s.match(/\b(\d{3})\b/)?.[1] || s, 10);
  return Number.isFinite(n) && n >= 400 && n < 500;
}

function restoreErrorProviderResponse(detail) {
  if (!detail || !detail.response || detail.providerResponse == null) return detail;
  if (typeof detail.providerResponse !== "object" || Object.keys(detail.providerResponse).length > 0) return detail;

  const status = detail.response.status;
  const error = detail.response.error ?? detail.error;
  if (status == null || error == null) return detail;

  return {
    ...detail,
    providerResponse: {
      status,
      body: typeof error === "string" ? error : JSON.stringify(error),
      recoveredFromStoredError: true,
    },
  };
}

function docToDetail(doc) {
  if (!doc) return null;
  const data = doc.data && typeof doc.data === "object" ? doc.data : {};
  const idStr = String(doc._id || data.id || "");
  const detail = {
    id: idStr,
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : (doc.timestamp || data.timestamp),
    provider: doc.provider ?? data.provider ?? null,
    model: doc.model ?? data.model ?? null,
    connectionId: doc.connectionId ?? data.connectionId ?? null,
    status: doc.status ?? data.status ?? null,
    latency: data.latency || {},
    tokens: data.tokens || {},
    request: data.request || {},
    providerRequest: data.providerRequest ?? null,
    providerResponse: data.providerResponse ?? null,
    response: data.response || {},
    error: data.error ?? null,
    ...(data.pxpipe ? { pxpipe: data.pxpipe } : {}),
  };
  return restoreErrorProviderResponse(detail);
}

export async function flushToDatabase() {
  if (isFlushing) return;
  if (writeBuffer.length === 0) return;
  isFlushing = true;
  try {
    while (writeBuffer.length > 0) {
      const items = writeBuffer.splice(0, writeBuffer.length);
      await getConnection();
      const config = await getObservabilityConfig();

      const docsToInsert = items.map((item) => {
        const id = item.id || generateDetailId();
        const timestamp = item.timestamp ? new Date(item.timestamp) : new Date();
        if (item.request?.headers) item.request.headers = sanitizeHeaders(item.request.headers);

        const is4xx = is4xxStatus(item.status) || is4xxStatus(item.response?.status);
        const record = {
          id,
          provider: item.provider || null,
          model: item.model || null,
          connectionId: item.connectionId || null,
          timestamp: timestamp.toISOString(),
          status: item.status || null,
          latency: item.latency || {},
          tokens: item.tokens || {},
          request: is4xx ? (item.request || {}) : truncateField(item.request, config.maxJsonSize),
          providerRequest: is4xx ? (item.providerRequest || null) : truncateField(item.providerRequest, config.maxJsonSize),
          providerResponse: is4xx ? (item.providerResponse ?? null) : truncateField(item.providerResponse, config.maxJsonSize),
          response: is4xx ? (item.response ?? {}) : truncateField(item.response, config.maxJsonSize),
          error: item.error || null,
          pxpipe: item.pxpipe || undefined,
        };

        return {
          _id: id,
          timestamp,
          provider: record.provider,
          model: record.model,
          connectionId: record.connectionId,
          status: record.status,
          data: record,
        };
      });

      if (docsToInsert.length > 0) {
        const ops = docsToInsert.map((doc) => ({
          updateOne: {
            filter: { _id: String(doc._id) },
            update: { $set: doc },
            upsert: true,
          },
        }));
        await RequestDetail.bulkWrite(ops, { ordered: false });
      }

      const count = await RequestDetail.countDocuments();
      if (count > config.maxRecords) {
        const excess = count - config.maxRecords;
        const oldestDocs = await RequestDetail.find({})
          .sort({ timestamp: 1 })
          .limit(excess)
          .select("_id")
          .lean();
        if (oldestDocs.length > 0) {
          const idsToDelete = oldestDocs.map((d) => d._id);
          await RequestDetail.deleteMany({ _id: { $in: idsToDelete } });
        }
      }
    }
  } catch (e) {
    console.error("[requestDetailsRepo] Batch write failed:", e);
  } finally {
    isFlushing = false;
  }
}

export async function saveRequestDetail(detail) {
  const config = await getObservabilityConfig();
  if (!config.enabled) return;

  writeBuffer.push(detail);

  if (writeBuffer.length >= config.batchSize) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushToDatabase().catch((e) => console.error("[requestDetailsRepo] flush err:", e));
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushToDatabase().catch(() => {});
    }, config.flushIntervalMs);
    if (flushTimer.unref) flushTimer.unref();
  }
}

export async function getRequestDetails(filter = {}) {
  await getConnection();
  const query = {};

  if (filter.provider) query.provider = filter.provider;
  if (filter.model) query.model = filter.model;
  if (filter.connectionId) query.connectionId = filter.connectionId;
  if (filter.status) query.status = filter.status;
  if (filter.startDate || filter.endDate) {
    query.timestamp = {};
    if (filter.startDate) query.timestamp.$gte = new Date(filter.startDate);
    if (filter.endDate) query.timestamp.$lte = new Date(filter.endDate);
  }

  const totalItems = await RequestDetail.countDocuments(query);
  const page = filter.page || 1;
  const pageSize = filter.pageSize || 50;
  const totalPages = Math.ceil(totalItems / pageSize) || 0;
  const offset = (page - 1) * pageSize;

  const docs = await RequestDetail.find(query)
    .sort({ timestamp: -1, _id: -1 })
    .skip(offset)
    .limit(pageSize)
    .lean();

  const details = docs.map(docToDetail);

  return {
    details,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function getDistinctProviders() {
  await getConnection();
  const providers = await RequestDetail.distinct("provider", { provider: { $ne: null } });
  return (providers || []).filter(Boolean).sort();
}

export async function getRequestDetailById(id) {
  if (!id) return null;
  await getConnection();
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { _id: String(id) }] }
    : { _id: String(id) };
  const doc = await RequestDetail.findOne(query).lean();
  return doc ? docToDetail(doc) : null;
}
const _shutdownHandler = async () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (writeBuffer.length > 0) await flushToDatabase();
};

function ensureShutdownHandler() {
  process.off("beforeExit", _shutdownHandler);
  process.off("SIGINT", _shutdownHandler);
  process.off("SIGTERM", _shutdownHandler);
  process.off("exit", _shutdownHandler);

  process.on("beforeExit", _shutdownHandler);
  process.on("SIGINT", _shutdownHandler);
  process.on("SIGTERM", _shutdownHandler);
  process.on("exit", _shutdownHandler);
}

ensureShutdownHandler();
