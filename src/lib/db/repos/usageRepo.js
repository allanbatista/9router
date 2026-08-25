import { EventEmitter } from "events";
import { getConnection } from "../connection.js";
import { UsageHistory } from "../models/UsageHistory.js";
import { UsageDaily } from "../models/UsageDaily.js";
import { Meta } from "../models/Meta.js";
import { RequestDetail } from "../models/RequestDetail.js";
import { getCachedTokens, getPromptTokens } from "@/shared/utils/usageTokens.js";
import { classifyRequest } from "@/shared/utils/requestClassification.js";

function maskApiKey(key) {
  if (!key || typeof key !== "string") return null;
  if (key.length <= 8) return key.charAt(0) + "***";
  return key.slice(0, 8) + "***";
}

function escapeSubdocKey(key) {
  if (key == null) return "unknown";
  return String(key).replace(/\./g, "_dot_").replace(/\$/g, "_dollar_");
}

function unescapeSubdocKey(key) {
  if (key == null) return "";
  return String(key).replace(/_dot_/g, ".").replace(/_dollar_/g, "$");
}
const PENDING_TIMEOUT_MS = 60 * 1000;
const RING_CAP = 50;
const CONN_CACHE_TTL_MS = 30 * 1000;
const PERIOD_MS = { "24h": 86400000, "7d": 604800000, "30d": 2592000000, "60d": 5184000000 };

function getRequestMetricsCutoff(period) {
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (PERIOD_MS[period]) return new Date(Date.now() - PERIOD_MS[period]);
  return null;
}

function getToolCallTimelineConfig(period) {
  const now = new Date();
  if (period === "today" || period === "24h") {
    const start = new Date(period === "today" ? now : now.getTime() - PERIOD_MS["24h"]);
    if (period === "today") start.setHours(0, 0, 0, 0);
    return {
      startTime: start.getTime(),
      bucketMs: 60 * 60 * 1000,
      bucketCount: 24,
      labelFn: (timestamp) => new Date(timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    };
  }

  const bucketCount = period === "7d" ? 7 : period === "30d" ? 30 : period === "60d" ? 60 : 24;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (bucketCount - 1));
  return {
    startTime: start.getTime(),
    bucketMs: 24 * 60 * 60 * 1000,
    bucketCount,
    labelFn: (timestamp) => new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

async function getToolCallMetrics(period) {
  const timelineConfig = getToolCallTimelineConfig(period);
  const metrics = {
    toolCallRequests: 0,
    toolCallCount: 0,
    toolCallSuccessRequests: 0,
    toolCallAbortedRequests: 0,
    byToolName: {},
    byRequestType: {},
    byAgentRequestType: {},
    toolCallTimeline: Array.from({ length: timelineConfig.bucketCount }, (_, index) => ({
      label: timelineConfig.labelFn(timelineConfig.startTime + index * timelineConfig.bucketMs),
      timestamp: timelineConfig.startTime + index * timelineConfig.bucketMs,
      requests: 0,
      calls: 0,
      byToolName: {},
    })),
  };

  try {
    const cutoff = getRequestMetricsCutoff(period);
    const query = cutoff ? { timestamp: { $gte: cutoff } } : {};
    const rows = await RequestDetail.find(query)
      .select({
        timestamp: 1,
        status: 1,
        requestType: 1,
        agentRequestType: 1,
        isToolCall: 1,
        toolCallCount: 1,
        toolCallNames: 1,
        "data.status": 1,
        "data.requestType": 1,
        "data.agentRequestType": 1,
        "data.isToolCall": 1,
        "data.toolCallCount": 1,
        "data.toolCallNames": 1,
        "data.response.termination": 1,
        "data.response.metrics": 1,
        "data.providerResponse.termination": 1,
        "data.providerResponse.metrics": 1,
        "data.providerRequest.requestType": 1,
        "data.providerResponse.choices.message.tool_calls": 1,
        "data.providerResponse.output.type": 1,
        "data.providerResponse.output.id": 1,
        "data.providerResponse.output.call_id": 1,
        "data.providerResponse.output.name": 1,
        "data.providerResponse.candidates.content.parts.functionCall": 1,
      })
      .lean();

    for (const row of rows) {
      const classification = classifyRequest(row);
      const requestType = classification.requestType;
      if (requestType) metrics.byRequestType[requestType] = (metrics.byRequestType[requestType] || 0) + 1;
      if (classification.agentRequestType) {
        const agentType = classification.agentRequestType;
        metrics.byAgentRequestType[agentType] = (metrics.byAgentRequestType[agentType] || 0) + 1;
      }
      if (!classification.isToolCall) continue;

      metrics.toolCallRequests++;
      metrics.toolCallCount += classification.toolCallCount;
      const namesInRequest = new Set();
      for (const call of classification.toolCalls) {
        const name = call.name || "unknown";
        namesInRequest.add(name);
        if (!metrics.byToolName[name]) metrics.byToolName[name] = { requests: 0, calls: 0 };
        metrics.byToolName[name].calls++;
      }
      for (const name of namesInRequest) metrics.byToolName[name].requests++;

      const timestamp = new Date(row.timestamp || row.data?.timestamp).getTime();
      const bucketIndex = Number.isFinite(timestamp)
        ? Math.floor((timestamp - timelineConfig.startTime) / timelineConfig.bucketMs)
        : -1;
      const bucket = metrics.toolCallTimeline[bucketIndex];
      if (bucket) {
        bucket.requests++;
        bucket.calls += classification.toolCallCount;
        for (const call of classification.toolCalls) {
          const name = call.name || "unknown";
          bucket.byToolName[name] = (bucket.byToolName[name] || 0) + 1;
        }
      }

      const status = row.status || row.data?.status;
      const termination = row.data?.response?.termination || row.data?.providerResponse?.termination;
      if (status === "success" || status === "ok" || (status === "aborted" && termination === "client_closed")) {
        metrics.toolCallSuccessRequests++;
      }
      if (status === "aborted") metrics.toolCallAbortedRequests++;
    }
  } catch (error) {
    console.error("[usageRepo] getToolCallMetrics failed:", error.message);
  }

  return metrics;
}

// In-memory state shared across Next.js modules
if (!global._pendingRequests) global._pendingRequests = { byModel: {}, byAccount: {} };
if (!global._lastErrorProvider) global._lastErrorProvider = { provider: "", ts: 0 };
if (!global._statsEmitter) {
  global._statsEmitter = new EventEmitter();
  global._statsEmitter.setMaxListeners(50);
}
if (!global._pendingTimers) global._pendingTimers = {};
if (!global._recentRing) global._recentRing = { items: [], initialized: false };
if (!global._connectionMapCache) global._connectionMapCache = { map: {}, ts: 0 };
if (!global._statsEmitTimers) global._statsEmitTimers = { pending: null, update: null };

const pendingRequests = global._pendingRequests;
const lastErrorProvider = global._lastErrorProvider;
const pendingTimers = global._pendingTimers;
const recentRing = global._recentRing;
const connCache = global._connectionMapCache;
const statsEmitTimers = global._statsEmitTimers;

export const statsEmitter = global._statsEmitter;

function scheduleStatsEvent(event, delayMs = 150) {
  const key = event === "update" ? "update" : "pending";
  if (statsEmitTimers[key]) return;
  statsEmitTimers[key] = setTimeout(() => {
    statsEmitTimers[key] = null;
    statsEmitter.emit(event);
  }, delayMs);
  statsEmitTimers[key]?.unref?.();
}

function getLocalDateKey(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pushToRing(entry) {
  recentRing.items.push(entry);
  if (recentRing.items.length > RING_CAP) {
    recentRing.items = recentRing.items.slice(-RING_CAP);
  }
}

async function getConnectionMapCached() {
  if (Date.now() - connCache.ts < CONN_CACHE_TTL_MS) return connCache.map;
  try {
    const { getProviderConnections } = await import("./connectionsRepo.js");
    const all = await getProviderConnections();
    const map = {};
    for (const c of all) map[c.id] = c.name || c.email || c.id;
    connCache.map = map;
    connCache.ts = Date.now();
  } catch {}
  return connCache.map;
}

async function ensureRingInitialized() {
  if (recentRing.initialized) return;
  recentRing.initialized = true;
  try {
    await getConnection();
    const docs = await UsageHistory.find({})
      .sort({ timestamp: -1, _id: -1 })
      .limit(RING_CAP)
      .lean();
    recentRing.items = docs.reverse().map((r) => ({
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
      provider: r.provider,
      model: r.model,
      connectionId: r.connectionId,
      apiKey: r.apiKey,
      endpoint: r.endpoint,
      cost: r.cost,
      status: r.status,
      tokens: r.tokens || {},
    }));
  } catch {}
}

async function calculateCost(provider, model, tokens) {
  if (!tokens || !provider || !model) return 0;
  try {
    const { getPricingForModel } = await import("./pricingRepo.js");
    const pricing = await getPricingForModel(provider, model);
    if (!pricing) return 0;

    try {
      const { calculateCostFromTokens } = await import("open-sse/providers/pricing.js");
      return calculateCostFromTokens(tokens, pricing);
    } catch {
      const promptTokens = getPromptTokens(tokens);
      const completionTokens = tokens.completion_tokens || tokens.output_tokens || 0;
      const promptCost = (promptTokens * (pricing.prompt || 0));
      const completionCost = (completionTokens * (pricing.completion || 0));
      return promptCost + completionCost;
    }
  } catch (e) {
    console.error("Error calculating cost:", e);
    return 0;
  }
}

export function trackPendingRequest(model, provider, connectionId, started, error = false) {
  const modelKey = provider ? `${model} (${provider})` : model;
  const timerKey = `${connectionId}|${modelKey}`;

  if (!pendingRequests.byModel[modelKey]) pendingRequests.byModel[modelKey] = 0;
  pendingRequests.byModel[modelKey] = Math.max(0, pendingRequests.byModel[modelKey] + (started ? 1 : -1));
  if (pendingRequests.byModel[modelKey] === 0) delete pendingRequests.byModel[modelKey];

  if (connectionId) {
    if (!pendingRequests.byAccount[connectionId]) pendingRequests.byAccount[connectionId] = {};
    if (!pendingRequests.byAccount[connectionId][modelKey]) pendingRequests.byAccount[connectionId][modelKey] = 0;
    pendingRequests.byAccount[connectionId][modelKey] = Math.max(0, pendingRequests.byAccount[connectionId][modelKey] + (started ? 1 : -1));
    if (pendingRequests.byAccount[connectionId][modelKey] === 0) {
      delete pendingRequests.byAccount[connectionId][modelKey];
      if (Object.keys(pendingRequests.byAccount[connectionId]).length === 0) {
        delete pendingRequests.byAccount[connectionId];
      }
    }
  }

  if (started) {
    clearTimeout(pendingTimers[timerKey]);
    pendingTimers[timerKey] = setTimeout(() => {
      delete pendingTimers[timerKey];
      if (pendingRequests.byModel[modelKey] > 0) pendingRequests.byModel[modelKey] = 0;
      if (connectionId && pendingRequests.byAccount[connectionId]?.[modelKey] > 0) {
        pendingRequests.byAccount[connectionId][modelKey] = 0;
      }
      scheduleStatsEvent("pending");
    }, PENDING_TIMEOUT_MS);
  } else {
    clearTimeout(pendingTimers[timerKey]);
    delete pendingTimers[timerKey];
  }

  if (!started && error && provider) {
    lastErrorProvider.provider = provider.toLowerCase();
    lastErrorProvider.ts = Date.now();
  }

  scheduleStatsEvent("pending");
}

export async function getActiveRequests() {
  const activeRequests = [];
  const connectionMap = await getConnectionMapCached();

  for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
    for (const [modelKey, count] of Object.entries(models)) {
      if (count > 0) {
        const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
        const match = modelKey.match(/^(.*) \((.*)\)$/);
        activeRequests.push({
          model: match ? match[1] : modelKey,
          provider: match ? match[2] : "unknown",
          account: accountName,
          count,
        });
      }
    }
  }

  await ensureRingInitialized();
  const seen = new Set();
  const recentRequests = [...recentRing.items]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map((e) => {
      const t = e.tokens || {};
      return {
        timestamp: e.timestamp,
        model: e.model,
        provider: e.provider || "",
        promptTokens: getPromptTokens(t),
        completionTokens: t.completion_tokens || t.output_tokens || 0,
        status: e.status || "ok",
      };
    })
    .filter((e) => {
      if (e.promptTokens === 0 && e.completionTokens === 0) return false;
      const minute = e.timestamp ? e.timestamp.slice(0, 16) : "";
      const key = `${e.model}|${e.provider}|${e.promptTokens}|${e.completionTokens}|${minute}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  const errorProvider = Date.now() - lastErrorProvider.ts < 10000 ? lastErrorProvider.provider : "";
  return { activeRequests, recentRequests, errorProvider };
}

export async function saveRequestUsage(entry) {
  try {
    await getConnection();

    if (!entry.timestamp) entry.timestamp = new Date().toISOString();
    const timestampDate = new Date(entry.timestamp);
    entry.cost = await calculateCost(entry.provider, entry.model, entry.tokens);

    const tokens = entry.tokens || {};
    const promptTokens = getPromptTokens(tokens);
    const completionTokens = tokens.completion_tokens || tokens.output_tokens || 0;
    const cachedTokens = getCachedTokens(tokens);
    const cost = entry.cost || 0;

    // Deduplication check
    const existing = await UsageHistory.findOne({
      timestamp: timestampDate,
      provider: entry.provider || null,
      model: entry.model || null,
      connectionId: entry.connectionId || null,
      apiKey: entry.apiKey || null,
      promptTokens,
      completionTokens,
    })
      .sort({ _id: -1 })
      .lean();

    if (existing) {
      if (!existing.endpoint && entry.endpoint) {
        await UsageHistory.updateOne({ _id: existing._id }, { $set: { endpoint: entry.endpoint } });
      }
      return;
    }

    // Extract and normalize agentMetadata from entry
    const rawMeta = entry.agentMetadata || entry.meta?.agentMetadata || {};
    let normAgentMeta = {};
    if (Array.isArray(rawMeta)) {
      for (const item of rawMeta) {
        if (item && item.key != null && item.value != null) {
          normAgentMeta[String(item.key)] = item.value;
        }
      }
    } else if (rawMeta && typeof rawMeta === "object") {
      normAgentMeta = { ...rawMeta };
    }

    // 1. Insert into UsageHistory
    await UsageHistory.create({
      timestamp: timestampDate,
      provider: entry.provider || null,
      model: entry.model || null,
      connectionId: entry.connectionId || null,
      apiKey: entry.apiKey || null,
      endpoint: entry.endpoint || null,
      promptTokens,
      completionTokens,
      cost,
      status: entry.status || "ok",
      tokens,
      agentMetadata: normAgentMeta,
      meta: entry.meta || {},
    });

    // 2. Atomic $inc in UsageDaily
    const dateKey = getLocalDateKey(entry.timestamp);

    const incUpdates = {
      requests: 1,
      promptTokens,
      completionTokens,
      cachedTokens,
      cost,
    };

    const setUpdates = {};

    if (entry.provider) {
      incUpdates[`byProvider.${entry.provider}.requests`] = 1;
      incUpdates[`byProvider.${entry.provider}.promptTokens`] = promptTokens;
      incUpdates[`byProvider.${entry.provider}.completionTokens`] = completionTokens;
      incUpdates[`byProvider.${entry.provider}.cachedTokens`] = cachedTokens;
      incUpdates[`byProvider.${entry.provider}.cost`] = cost;
    }

    const modelKey = entry.provider ? `${entry.model}|${entry.provider}` : entry.model;
    if (modelKey) {
      incUpdates[`byModel.${modelKey}.requests`] = 1;
      incUpdates[`byModel.${modelKey}.promptTokens`] = promptTokens;
      incUpdates[`byModel.${modelKey}.completionTokens`] = completionTokens;
      incUpdates[`byModel.${modelKey}.cachedTokens`] = cachedTokens;
      incUpdates[`byModel.${modelKey}.cost`] = cost;
      setUpdates[`byModel.${modelKey}.rawModel`] = entry.model;
      setUpdates[`byModel.${modelKey}.provider`] = entry.provider;
    }

    if (entry.connectionId) {
      incUpdates[`byAccount.${entry.connectionId}.requests`] = 1;
      incUpdates[`byAccount.${entry.connectionId}.promptTokens`] = promptTokens;
      incUpdates[`byAccount.${entry.connectionId}.completionTokens`] = completionTokens;
      incUpdates[`byAccount.${entry.connectionId}.cachedTokens`] = cachedTokens;
      incUpdates[`byAccount.${entry.connectionId}.cost`] = cost;
      setUpdates[`byAccount.${entry.connectionId}.rawModel`] = entry.model;
      setUpdates[`byAccount.${entry.connectionId}.provider`] = entry.provider;
    }

    const apiKeyVal = entry.apiKey && typeof entry.apiKey === "string" ? entry.apiKey : "local-no-key";
    const akModelKey = `${apiKeyVal}|${entry.model}|${entry.provider || "unknown"}`;
    incUpdates[`byApiKey.${akModelKey}.requests`] = 1;
    incUpdates[`byApiKey.${akModelKey}.promptTokens`] = promptTokens;
    incUpdates[`byApiKey.${akModelKey}.completionTokens`] = completionTokens;
    incUpdates[`byApiKey.${akModelKey}.cachedTokens`] = cachedTokens;
    incUpdates[`byApiKey.${akModelKey}.cost`] = cost;
    setUpdates[`byApiKey.${akModelKey}.rawModel`] = entry.model;
    setUpdates[`byApiKey.${akModelKey}.provider`] = entry.provider;
    setUpdates[`byApiKey.${akModelKey}.apiKey`] = entry.apiKey || null;

    const endpoint = entry.endpoint || "Unknown";
    const epKey = `${endpoint}|${entry.model}|${entry.provider || "unknown"}`;
    incUpdates[`byEndpoint.${epKey}.requests`] = 1;
    incUpdates[`byEndpoint.${epKey}.promptTokens`] = promptTokens;
    incUpdates[`byEndpoint.${epKey}.completionTokens`] = completionTokens;
    incUpdates[`byEndpoint.${epKey}.cachedTokens`] = cachedTokens;
    incUpdates[`byEndpoint.${epKey}.cost`] = cost;
    setUpdates[`byEndpoint.${epKey}.endpoint`] = endpoint;
    setUpdates[`byEndpoint.${epKey}.rawModel`] = entry.model;
    setUpdates[`byEndpoint.${epKey}.provider`] = entry.provider;
    // Aggregate byAgentMetadata
    for (const [dimKey, dimVal] of Object.entries(normAgentMeta)) {
      if (dimVal == null || String(dimVal).trim() === "") continue;
      const rawValueStr = String(dimVal).trim();
      const safeDim = escapeSubdocKey(dimKey);
      const safeVal = escapeSubdocKey(rawValueStr);
      const metaPath = `byAgentMetadata.${safeDim}.${safeVal}`;

      incUpdates[`${metaPath}.requests`] = 1;
      incUpdates[`${metaPath}.promptTokens`] = promptTokens;
      incUpdates[`${metaPath}.completionTokens`] = completionTokens;
      incUpdates[`${metaPath}.cachedTokens`] = cachedTokens;
      incUpdates[`${metaPath}.cost`] = cost;
      setUpdates[`${metaPath}.rawValue`] = rawValueStr;
    }


    const dailyUpdate = { $inc: incUpdates };
    if (Object.keys(setUpdates).length > 0) {
      dailyUpdate.$set = setUpdates;
    }

    await UsageDaily.findOneAndUpdate(
      { dateKey },
      dailyUpdate,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 3. Atomic counter increment in Meta
    await Meta.findOneAndUpdate(
      { key: "totalRequestsLifetime" },
      { $inc: { value: 1 }, $set: { updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    pushToRing(entry);
    scheduleStatsEvent("update", 250);
  } catch (e) {
    console.error("Failed to save usage stats:", e);
  }
}

export async function getUsageHistory(filter = {}) {
  await getConnection();
  const query = {};

  if (filter.provider) query.provider = filter.provider;
  if (filter.model) query.model = filter.model;
  if (filter.startDate || filter.endDate) {
    query.timestamp = {};
    if (filter.startDate) query.timestamp.$gte = new Date(filter.startDate);
    if (filter.endDate) query.timestamp.$lte = new Date(filter.endDate);
  }

  const rows = await UsageHistory.find(query).sort({ timestamp: 1, _id: 1 }).lean();

  return rows.map((r) => ({
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
    provider: r.provider,
    model: r.model,
    connectionId: r.connectionId,
    apiKeyMasked: maskApiKey(r.apiKey),
    endpoint: r.endpoint,
    cost: r.cost,
    status: r.status,
    tokens: r.tokens || {},
  }));
}

async function loadDaysInRange(maxDays) {
  await getConnection();
  if (maxDays == null) {
    return await UsageDaily.find({}).sort({ dateKey: 1 }).lean();
  }
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - maxDays + 1);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  return await UsageDaily.find({ dateKey: { $gte: cutoffKey } }).sort({ dateKey: 1 }).lean();
}

export async function getUsageStats(period = "24h") {
  await getConnection();

  const [{ getProviderConnections }, { getApiKeys }, { getProviderNodes }] = await Promise.all([
    import("./connectionsRepo.js"),
    import("./apiKeysRepo.js"),
    import("./nodesRepo.js"),
  ]);

  let allConnections = [];
  try { allConnections = await getProviderConnections(); } catch {}
  const connectionMap = {};
  for (const c of allConnections) connectionMap[c.id] = c.name || c.email || c.id;

  const providerNodeNameMap = {};
  try {
    const nodes = await getProviderNodes();
    for (const n of nodes) if (n.id && n.name) providerNodeNameMap[n.id] = n.name;
  } catch {}

  let allApiKeys = [];
  try { allApiKeys = await getApiKeys(); } catch {}
  const apiKeyMap = {};
  for (const k of allApiKeys) apiKeyMap[k.key] = { name: k.name, id: k.id, createdAt: k.createdAt };

  // recentRequests from live history
  const recentDocs = await UsageHistory.find({})
    .sort({ timestamp: -1, _id: -1 })
    .limit(100)
    .lean();

  const seen = new Set();
  const recentRequests = recentDocs
    .map((r) => {
      const t = r.tokens || {};
      const accountName = connectionMap[r.connectionId] || (r.connectionId ? `Account ${r.connectionId.slice(0, 8)}…` : "");
      const tsStr = r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp;
      return {
        timestamp: tsStr,
        model: r.model,
        provider: r.provider || "",
        connectionId: r.connectionId || null,
        accountName,
        promptTokens: getPromptTokens(t),
        completionTokens: t.completion_tokens || t.output_tokens || 0,
        cachedTokens: getCachedTokens(t),
        status: r.status || "ok",
      };
    })
    .filter((e) => {
      if (e.promptTokens === 0 && e.completionTokens === 0) return false;
      const minute = e.timestamp ? e.timestamp.slice(0, 16) : "";
      const key = `${e.model}|${e.provider}|${e.promptTokens}|${e.completionTokens}|${minute}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  const stats = {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCachedTokens: 0,
    totalCost: 0,
    byProvider: {},
    byModel: {},
    byAccount: {},
    byApiKey: {},
    byEndpoint: {},
    byAgentMetadata: {},
    toolCallRequests: 0,
    toolCallCount: 0,
    toolCallSuccessRequests: 0,
    toolCallAbortedRequests: 0,
    byToolName: {},
    byRequestType: {},
    last10Minutes: [],
    pending: pendingRequests,
    activeRequests: [],
    recentRequests,
    errorProvider: Date.now() - lastErrorProvider.ts < 10000 ? lastErrorProvider.provider : "",
  };

  // Active requests
  for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
    for (const [modelKey, count] of Object.entries(models)) {
      if (count > 0) {
        const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
        const match = modelKey.match(/^(.*) \((.*)\)$/);
        stats.activeRequests.push({
          model: match ? match[1] : modelKey,
          provider: match ? match[2] : "unknown",
          account: accountName,
          count,
        });
      }
    }
  }

  // last10Minutes
  const now = new Date();
  const currentMinuteStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const tenMinutesAgo = new Date(currentMinuteStart.getTime() - 9 * 60 * 1000);
  const bucketMap = {};
  for (let i = 0; i < 10; i++) {
    const ts = currentMinuteStart.getTime() - (9 - i) * 60 * 1000;
    bucketMap[ts] = { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
    stats.last10Minutes.push(bucketMap[ts]);
  }

  const recent10 = await UsageHistory.find({
    timestamp: { $gte: tenMinutesAgo, $lte: now },
  }).lean();

  for (const r of recent10) {
    const tt = new Date(r.timestamp).getTime();
    const minuteStart = Math.floor(tt / 60000) * 60000;
    if (bucketMap[minuteStart]) {
      bucketMap[minuteStart].requests++;
      bucketMap[minuteStart].promptTokens += r.promptTokens || 0;
      bucketMap[minuteStart].completionTokens += r.completionTokens || 0;
      bucketMap[minuteStart].cost += r.cost || 0;
    }
  }

  const useDailySummary = period !== "24h" && period !== "today";

  if (useDailySummary) {
    const periodDays = { "7d": 7, "30d": 30, "60d": 60 };
    const maxDays = periodDays[period] || null;
    const dayRows = await loadDaysInRange(maxDays);

    for (const dr of dayRows) {
      const dateKey = dr.dateKey;
      const day = dr;
      stats.totalPromptTokens += day.promptTokens || 0;
      stats.totalCompletionTokens += day.completionTokens || 0;
      stats.totalCachedTokens += day.cachedTokens || 0;
      stats.totalCost += day.cost || 0;

      for (const [prov, p] of Object.entries(day.byProvider || {})) {
        if (!stats.byProvider[prov]) {
          stats.byProvider[prov] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
        }
        stats.byProvider[prov].requests += p.requests || 0;
        stats.byProvider[prov].promptTokens += p.promptTokens || 0;
        stats.byProvider[prov].completionTokens += p.completionTokens || 0;
        stats.byProvider[prov].cachedTokens += p.cachedTokens || 0;
        stats.byProvider[prov].cost += p.cost || 0;
      }

      for (const [mk, m] of Object.entries(day.byModel || {})) {
        const rawModel = m.rawModel || mk.split("|")[0];
        const provider = m.provider || mk.split("|")[1] || "";
        const statsKey = provider ? `${rawModel} (${provider})` : rawModel;
        const providerDisplayName = providerNodeNameMap[provider] || provider;
        if (!stats.byModel[statsKey]) {
          stats.byModel[statsKey] = {
            requests: 0,
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            cost: 0,
            rawModel,
            provider: providerDisplayName,
            lastUsed: dateKey,
          };
        }
        stats.byModel[statsKey].requests += m.requests || 0;
        stats.byModel[statsKey].promptTokens += m.promptTokens || 0;
        stats.byModel[statsKey].completionTokens += m.completionTokens || 0;
        stats.byModel[statsKey].cachedTokens += m.cachedTokens || 0;
        stats.byModel[statsKey].cost += m.cost || 0;
        if (dateKey > (stats.byModel[statsKey].lastUsed || "")) stats.byModel[statsKey].lastUsed = dateKey;
      }

      for (const [connId, a] of Object.entries(day.byAccount || {})) {
        const accountName = connectionMap[connId] || `Account ${connId.slice(0, 8)}...`;
        const rawModel = a.rawModel || "";
        const provider = a.provider || "";
        const providerDisplayName = providerNodeNameMap[provider] || provider;
        const accountKey = `${rawModel} (${provider} - ${accountName})`;
        if (!stats.byAccount[accountKey]) {
          stats.byAccount[accountKey] = {
            requests: 0,
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            cost: 0,
            rawModel,
            provider: providerDisplayName,
            connectionId: connId,
            accountName,
            lastUsed: dateKey,
          };
        }
        stats.byAccount[accountKey].requests += a.requests || 0;
        stats.byAccount[accountKey].promptTokens += a.promptTokens || 0;
        stats.byAccount[accountKey].completionTokens += a.completionTokens || 0;
        stats.byAccount[accountKey].cachedTokens += a.cachedTokens || 0;
        stats.byAccount[accountKey].cost += a.cost || 0;
        if (dateKey > (stats.byAccount[accountKey].lastUsed || "")) stats.byAccount[accountKey].lastUsed = dateKey;
      }

      for (const [akKey, ak] of Object.entries(day.byApiKey || {})) {
        const rawModel = ak.rawModel || "";
        const provider = ak.provider || "";
        const providerDisplayName = providerNodeNameMap[provider] || provider;
        const apiKeyVal = ak.apiKey;
        const keyInfo = apiKeyVal ? apiKeyMap[apiKeyVal] : null;
        const keyName = keyInfo?.name || (apiKeyVal ? apiKeyVal.slice(0, 8) + "..." : "Local (No API Key)");
        const apiKeyMasked = maskApiKey(apiKeyVal);
        const apiKeyKey = apiKeyMasked || "local-no-key";
        if (!stats.byApiKey[akKey]) {
          stats.byApiKey[akKey] = {
            requests: 0,
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            cost: 0,
            rawModel,
            provider: providerDisplayName,
            apiKeyMasked,
            keyName,
            apiKeyKey,
            lastUsed: dateKey,
          };
        }
        stats.byApiKey[akKey].requests += ak.requests || 0;
        stats.byApiKey[akKey].promptTokens += ak.promptTokens || 0;
        stats.byApiKey[akKey].completionTokens += ak.completionTokens || 0;
        stats.byApiKey[akKey].cachedTokens += ak.cachedTokens || 0;
        stats.byApiKey[akKey].cost += ak.cost || 0;
        if (dateKey > (stats.byApiKey[akKey].lastUsed || "")) stats.byApiKey[akKey].lastUsed = dateKey;
      }

      for (const [epKey, ep] of Object.entries(day.byEndpoint || {})) {
        const endpoint = ep.endpoint || epKey.split("|")[0] || "Unknown";
        const rawModel = ep.rawModel || "";
        const provider = ep.provider || "";
        const providerDisplayName = providerNodeNameMap[provider] || provider;
        if (!stats.byEndpoint[epKey]) {
          stats.byEndpoint[epKey] = {
            requests: 0,
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            cost: 0,
            endpoint,
            rawModel,
            provider: providerDisplayName,
            lastUsed: dateKey,
          };
        }
        stats.byEndpoint[epKey].requests += ep.requests || 0;
        stats.byEndpoint[epKey].promptTokens += ep.promptTokens || 0;
        stats.byEndpoint[epKey].completionTokens += ep.completionTokens || 0;
        stats.byEndpoint[epKey].cachedTokens += ep.cachedTokens || 0;
        stats.byEndpoint[epKey].cost += ep.cost || 0;
        if (dateKey > (stats.byEndpoint[epKey].lastUsed || "")) stats.byEndpoint[epKey].lastUsed = dateKey;
      }
      for (const [dimKey, dimVals] of Object.entries(day.byAgentMetadata || {})) {
        const unescapedDim = unescapeSubdocKey(dimKey);
        if (!stats.byAgentMetadata[unescapedDim]) {
          stats.byAgentMetadata[unescapedDim] = {};
        }
        for (const [valKey, v] of Object.entries(dimVals || {})) {
          const rawValue = v.rawValue || unescapeSubdocKey(valKey);
          if (!stats.byAgentMetadata[unescapedDim][rawValue]) {
            stats.byAgentMetadata[unescapedDim][rawValue] = {
              requests: 0,
              promptTokens: 0,
              completionTokens: 0,
              cachedTokens: 0,
              cost: 0,
              rawValue,
              lastUsed: dateKey,
            };
          }
          const item = stats.byAgentMetadata[unescapedDim][rawValue];
          item.requests += v.requests || 0;
          item.promptTokens += v.promptTokens || 0;
          item.completionTokens += v.completionTokens || 0;
          item.cachedTokens += v.cachedTokens || 0;
          item.cost += v.cost || 0;
          if (dateKey > (item.lastUsed || "")) item.lastUsed = dateKey;
        }
      }
    }

    // Overlay precise lastUsed timestamps from history
    const overlayCutoff = maxDays ? Date.now() - maxDays * 86400000 : 0;
    const histRows = await UsageHistory.find({
      timestamp: { $gte: new Date(overlayCutoff) },
    }).lean();

    for (const e of histRows) {
      const ts = e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp;
      const modelKey = e.provider ? `${e.model} (${e.provider})` : e.model;
      if (stats.byModel[modelKey] && new Date(ts) > new Date(stats.byModel[modelKey].lastUsed)) stats.byModel[modelKey].lastUsed = ts;

      if (e.connectionId) {
        const accountName = connectionMap[e.connectionId] || `Account ${e.connectionId.slice(0, 8)}...`;
        const accountKey = `${e.model} (${e.provider} - ${accountName})`;
        if (stats.byAccount[accountKey] && new Date(ts) > new Date(stats.byAccount[accountKey].lastUsed)) stats.byAccount[accountKey].lastUsed = ts;
      }

      const apiKeyKey = (e.apiKey && typeof e.apiKey === "string")
        ? `${e.apiKey}|${e.model}|${e.provider || "unknown"}`
        : "local-no-key";
      if (stats.byApiKey[apiKeyKey] && new Date(ts) > new Date(stats.byApiKey[apiKeyKey].lastUsed)) stats.byApiKey[apiKeyKey].lastUsed = ts;

      const endpoint = e.endpoint || "Unknown";
      const endpointKey = `${endpoint}|${e.model}|${e.provider || "unknown"}`;
      if (stats.byEndpoint[endpointKey] && new Date(ts) > new Date(stats.byEndpoint[endpointKey].lastUsed)) stats.byEndpoint[endpointKey].lastUsed = ts;

      if (e.agentMetadata && typeof e.agentMetadata === "object") {
        for (const [dimKey, dimVal] of Object.entries(e.agentMetadata)) {
          if (dimVal == null || String(dimVal).trim() === "") continue;
          const rawValue = String(dimVal).trim();
          if (stats.byAgentMetadata[dimKey] && stats.byAgentMetadata[dimKey][rawValue]) {
            if (new Date(ts) > new Date(stats.byAgentMetadata[dimKey][rawValue].lastUsed)) {
              stats.byAgentMetadata[dimKey][rawValue].lastUsed = ts;
            }
          }
        }
      }
    }
  } else {
    // 24h / today: live history
    let cutoff;
    if (period === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      cutoff = startOfDay;
    } else {
      cutoff = new Date(Date.now() - PERIOD_MS["24h"]);
    }

    const filtered = await UsageHistory.find({ timestamp: { $gte: cutoff } }).lean();

    for (const r of filtered) {
      const tokens = r.tokens || {};
      const promptTokens = getPromptTokens(tokens);
      const completionTokens = tokens.completion_tokens || 0;
      const cachedTokens = getCachedTokens(tokens);
      const entryCost = r.cost || 0;
      const providerDisplayName = providerNodeNameMap[r.provider] || r.provider;
      const tsStr = r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp;

      stats.totalPromptTokens += promptTokens;
      stats.totalCompletionTokens += completionTokens;
      stats.totalCachedTokens += cachedTokens;
      stats.totalCost += entryCost;

      if (!stats.byProvider[r.provider]) stats.byProvider[r.provider] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
      stats.byProvider[r.provider].requests++;
      stats.byProvider[r.provider].promptTokens += promptTokens;
      stats.byProvider[r.provider].completionTokens += completionTokens;
      stats.byProvider[r.provider].cachedTokens += cachedTokens;
      stats.byProvider[r.provider].cost += entryCost;

      const modelKey = r.provider ? `${r.model} (${r.provider})` : r.model;
      if (!stats.byModel[modelKey]) {
        stats.byModel[modelKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, lastUsed: tsStr };
      }
      stats.byModel[modelKey].requests++;
      stats.byModel[modelKey].promptTokens += promptTokens;
      stats.byModel[modelKey].completionTokens += completionTokens;
      stats.byModel[modelKey].cachedTokens += cachedTokens;
      stats.byModel[modelKey].cost += entryCost;
      if (new Date(tsStr) > new Date(stats.byModel[modelKey].lastUsed)) stats.byModel[modelKey].lastUsed = tsStr;

      if (r.connectionId) {
        const accountName = connectionMap[r.connectionId] || `Account ${r.connectionId.slice(0, 8)}...`;
        const accountKey = `${r.model} (${r.provider} - ${accountName})`;
        if (!stats.byAccount[accountKey]) {
          stats.byAccount[accountKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, connectionId: r.connectionId, accountName, lastUsed: tsStr };
        }
        stats.byAccount[accountKey].requests++;
        stats.byAccount[accountKey].promptTokens += promptTokens;
        stats.byAccount[accountKey].completionTokens += completionTokens;
        stats.byAccount[accountKey].cachedTokens += cachedTokens;
        stats.byAccount[accountKey].cost += entryCost;
        if (new Date(tsStr) > new Date(stats.byAccount[accountKey].lastUsed)) stats.byAccount[accountKey].lastUsed = tsStr;
      }

      if (r.apiKey && typeof r.apiKey === "string") {
        const keyInfo = apiKeyMap[r.apiKey];
        const keyName = keyInfo?.name || r.apiKey.slice(0, 8) + "...";
        const apiKeyMasked = maskApiKey(r.apiKey);
        const akKey = `${apiKeyMasked}|${r.model}|${r.provider || "unknown"}`;
        if (!stats.byApiKey[akKey]) {
          stats.byApiKey[akKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, apiKeyMasked, keyName, apiKeyKey: apiKeyMasked, lastUsed: tsStr };
        }
        const ake = stats.byApiKey[akKey];
        ake.requests++; ake.promptTokens += promptTokens; ake.completionTokens += completionTokens; ake.cachedTokens += cachedTokens; ake.cost += entryCost;
        if (new Date(tsStr) > new Date(ake.lastUsed)) ake.lastUsed = tsStr;
      } else {
        if (!stats.byApiKey["local-no-key"]) {
          stats.byApiKey["local-no-key"] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, apiKeyMasked: null, keyName: "Local (No API Key)", apiKeyKey: "local-no-key", lastUsed: tsStr };
        }
        const ake = stats.byApiKey["local-no-key"];
        ake.requests++; ake.promptTokens += promptTokens; ake.completionTokens += completionTokens; ake.cachedTokens += cachedTokens; ake.cost += entryCost;
        if (new Date(tsStr) > new Date(ake.lastUsed)) ake.lastUsed = tsStr;
      }

      const endpoint = r.endpoint || "Unknown";
      const epKey = `${endpoint}|${r.model}|${r.provider || "unknown"}`;
      if (!stats.byEndpoint[epKey]) {
        stats.byEndpoint[epKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, endpoint, rawModel: r.model, provider: providerDisplayName, lastUsed: tsStr };
      }
      const epe = stats.byEndpoint[epKey];
      epe.requests++; epe.promptTokens += promptTokens; epe.completionTokens += completionTokens; epe.cachedTokens += cachedTokens; epe.cost += entryCost;
      if (new Date(tsStr) > new Date(epe.lastUsed)) epe.lastUsed = tsStr;

      if (r.agentMetadata && typeof r.agentMetadata === "object") {
        for (const [dimKey, dimVal] of Object.entries(r.agentMetadata)) {
          if (dimVal == null || String(dimVal).trim() === "") continue;
          const rawValue = String(dimVal).trim();
          if (!stats.byAgentMetadata[dimKey]) {
            stats.byAgentMetadata[dimKey] = {};
          }
          if (!stats.byAgentMetadata[dimKey][rawValue]) {
            stats.byAgentMetadata[dimKey][rawValue] = {
              requests: 0,
              promptTokens: 0,
              completionTokens: 0,
              cachedTokens: 0,
              cost: 0,
              rawValue,
              lastUsed: tsStr,
            };
          }
          const ame = stats.byAgentMetadata[dimKey][rawValue];
          ame.requests++;
          ame.promptTokens += promptTokens;
          ame.completionTokens += completionTokens;
          ame.cachedTokens += cachedTokens;
          ame.cost += entryCost;
          if (new Date(tsStr) > new Date(ame.lastUsed)) ame.lastUsed = tsStr;
        }
      }
    }
  }

  Object.assign(stats, await getToolCallMetrics(period));
  stats.totalRequests = Object.values(stats.byProvider).reduce((sum, p) => sum + (p.requests || 0), 0);
  return stats;
}

export async function getChartData(period = "24h") {
  await getConnection();
  const now = Date.now();

  if (period === "today") {
    const bucketCount = 24;
    const bucketMs = 3600000;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTime = startOfDay.getTime();
    const endTime = startTime + bucketCount * bucketMs;
    const labelFn = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: labelFn(startTime + i * bucketMs), tokens: 0, inputTokens: 0, cachedTokens: 0, uncachedInputTokens: 0, cost: 0, requests: 0 }));

    const rows = await UsageHistory.find({
      timestamp: { $gte: new Date(startTime) },
    }).lean();

    for (const r of rows) {
      const t = new Date(r.timestamp).getTime();
      if (t < startTime || t >= endTime) continue;
      const idx = Math.floor((t - startTime) / bucketMs);
      if (idx >= 0 && idx < bucketCount) {
        buckets[idx].requests++;
        buckets[idx].tokens += (r.promptTokens || 0) + (r.completionTokens || 0);
        buckets[idx].inputTokens += r.promptTokens || 0;
        buckets[idx].cachedTokens += Math.min(r.promptTokens || 0, getCachedTokens(r.tokens || {}));
        buckets[idx].uncachedInputTokens = buckets[idx].inputTokens - buckets[idx].cachedTokens;
        buckets[idx].cost += r.cost || 0;
      }
    }
    return buckets;
  }

  if (period === "24h") {
    const bucketCount = 24;
    const bucketMs = 3600000;
    const labelFn = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const startTime = now - bucketCount * bucketMs;
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: labelFn(startTime + i * bucketMs), tokens: 0, inputTokens: 0, cachedTokens: 0, uncachedInputTokens: 0, cost: 0, requests: 0 }));

    const rows = await UsageHistory.find({
      timestamp: { $gte: new Date(startTime) },
    }).lean();

    for (const r of rows) {
      const t = new Date(r.timestamp).getTime();
      if (t < startTime || t > now) continue;
      const idx = Math.min(Math.floor((t - startTime) / bucketMs), bucketCount - 1);
      buckets[idx].requests++;
      buckets[idx].tokens += (r.promptTokens || 0) + (r.completionTokens || 0);
      buckets[idx].inputTokens += r.promptTokens || 0;
      buckets[idx].cachedTokens += Math.min(r.promptTokens || 0, getCachedTokens(r.tokens || {}));
      buckets[idx].uncachedInputTokens = buckets[idx].inputTokens - buckets[idx].cachedTokens;
      buckets[idx].cost += r.cost || 0;
    }
    return buckets;
  }

  const bucketCount = period === "7d" ? 7 : period === "30d" ? 30 : 60;
  const today = new Date();
  const labelFn = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const dayRows = await loadDaysInRange(bucketCount);
  const dayMap = {};
  for (const r of dayRows) dayMap[r.dateKey] = r;

  return Array.from({ length: bucketCount }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (bucketCount - 1 - i));
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayData = dayMap[dateKey];
    return {
      label: labelFn(d),
      tokens: dayData ? (dayData.promptTokens || 0) + (dayData.completionTokens || 0) : 0,
      inputTokens: dayData?.promptTokens || 0,
      cachedTokens: Math.min(dayData?.promptTokens || 0, dayData?.cachedTokens || 0),
      uncachedInputTokens: Math.max(0, (dayData?.promptTokens || 0) - Math.min(dayData?.promptTokens || 0, dayData?.cachedTokens || 0)),
      cost: dayData ? dayData.cost || 0 : 0,
      requests: dayData?.requests || 0,
    };
  });
}

function formatLogDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function appendRequestLog() {}

export async function getRecentLogs(limit = 200) {
  try {
    await getConnection();
    const rows = await UsageHistory.find({})
      .sort({ timestamp: -1, _id: -1 })
      .limit(limit)
      .lean();

    if (!rows.length) return [];

    const connMap = {};
    try {
      const { getProviderConnections } = await import("./connectionsRepo.js");
      const connections = await getProviderConnections();
      for (const c of connections) connMap[c.id] = c.name || c.email || "";
    } catch {}

    return rows.map((r) => {
      const ts = formatLogDate(new Date(r.timestamp));
      const p = r.provider?.toUpperCase() || "-";
      const m = r.model || "-";
      const account = connMap[r.connectionId] || (r.connectionId ? r.connectionId.slice(0, 8) : "-");
      const tk = r.tokens || {};
      const sent = r.promptTokens ?? tk.prompt_tokens ?? "-";
      const received = r.completionTokens ?? tk.completion_tokens ?? "-";
      return `${ts} | ${m} | ${p} | ${account} | ${sent} | ${received} | ${r.status || "-"}`;
    });
  } catch (e) {
    console.error("[usageRepo] getRecentLogs failed:", e.message);
    return [];
  }
}
