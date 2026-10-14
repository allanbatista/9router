import { v4 as uuidv4 } from "uuid";
import { getConnection } from "../connection.js";
import { ProviderConnection } from "../models/ProviderConnection.js";

const OPTIONAL_FIELDS = [
  "displayName", "email", "globalPriority", "defaultModel",
  "accessToken", "refreshToken", "expiresAt", "tokenType",
  "scope", "projectId", "apiKey", "testStatus",
  "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn", "errorCode",
  "consecutiveUseCount", "idToken", "lastRefreshAt",
];

function docToConn(doc) {
  if (!doc) return null;
  const extra = doc.data && typeof doc.data === "object" ? doc.data : {};
  return {
    ...extra,
    id: doc._id,
    provider: doc.provider,
    authType: doc.authType,
    name: doc.name,
    email: doc.email,
    priority: doc.priority,
    isActive: doc.isActive === true || doc.isActive === 1,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : (doc.updatedAt || new Date().toISOString()),
  };
}

function deriveConnectionName(data, fallbackName) {
  if (data.provider === "github") {
    return data.providerSpecificData?.githubLogin
      || data.providerSpecificData?.githubEmail
      || data.email
      || data.providerSpecificData?.githubName
      || fallbackName;
  }
  return fallbackName;
}

export async function getProviderConnections(filter = {}) {
  await getConnection();
  const query = {};
  if (filter.provider) {
    query.provider = filter.provider;
  }
  if (filter.isActive !== undefined) {
    query.isActive = Boolean(filter.isActive);
  }
  const docs = await ProviderConnection.find(query).lean();
  const list = docs.map(docToConn);
  list.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  return list;
}

export async function getProviderConnectionById(id) {
  if (!id) return null;
  await getConnection();
  const doc = await ProviderConnection.findById(id).lean();
  return docToConn(doc);
}

// Internal reorder by provider priority
async function reorderForProvider(providerId) {
  if (!providerId) return;
  await getConnection();
  const docs = await ProviderConnection.find({ provider: providerId }).lean();
  const list = docs.map(docToConn);
  list.sort((a, b) => {
    const pDiff = (a.priority || 0) - (b.priority || 0);
    if (pDiff !== 0) return pDiff;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
  const bulkOps = list.map((c, i) => ({
    updateOne: {
      filter: { _id: c.id },
      update: { $set: { priority: i + 1 } },
    },
  }));
  if (bulkOps.length > 0) {
    await ProviderConnection.bulkWrite(bulkOps);
  }
}

export async function createProviderConnection(data) {
  await getConnection();
  const now = new Date();
  const allDocs = await ProviderConnection.find({ provider: data.provider }).lean();
  const all = allDocs.map(docToConn);

  let existing = null;
  if (data.authType === "oauth" && data.email) {
    const incomingUsername = data.providerSpecificData?.username;
    const incomingWs = data.providerSpecificData?.chatgptAccountId;
    existing = all.find(c => {
      if (c.authType !== "oauth" || c.email !== data.email) return false;

      // Codex/OpenAI can issue multiple OAuth grants for the same email.
      if (data.provider === "codex") {
        const existingWs = c.providerSpecificData?.chatgptAccountId;
        return !!incomingWs && !!existingWs && incomingWs === existingWs;
      }

      // Workspace providers use workspace ID when both sides have it
      const existingWs = c.providerSpecificData?.chatgptAccountId;
      if (incomingWs && existingWs) return incomingWs === existingWs;
      if (incomingWs && !existingWs) return false;
      if (!incomingWs && existingWs) return false;

      const existingUsername = c.providerSpecificData?.username;
      if (incomingUsername && existingUsername) {
        return incomingUsername === existingUsername;
      }
      if (incomingUsername || existingUsername) return false;
      return true;
    });
  } else if (data.authType === "apikey" && data.name) {
    existing = all.find(c => c.authType === "apikey" && c.name === data.name);
  }

  if (existing) {
    const merged = { ...existing, ...data, updatedAt: now.toISOString() };
    await updateProviderConnection(existing.id, merged);
    return merged;
  }

  let connectionName = data.name || null;
  if (!connectionName && (data.authType === "oauth" || data.authType === "access_token")) {
    connectionName = deriveConnectionName(data, data.email || `Account ${all.length + 1}`);
  }
  let connectionPriority = data.priority;
  if (!connectionPriority) {
    connectionPriority = all.reduce((m, c) => Math.max(m, c.priority || 0), 0) + 1;
  }

  const { id: inputId, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = data;
  const extraData = { ...rest };
  for (const f of OPTIONAL_FIELDS) {
    if (data[f] !== undefined && data[f] !== null) extraData[f] = data[f];
  }
  if (data.providerSpecificData && Object.keys(data.providerSpecificData).length > 0) {
    extraData.providerSpecificData = data.providerSpecificData;
  }

  const newId = inputId || uuidv4();
  const connDoc = {
    _id: newId,
    provider: data.provider,
    authType: data.authType || "oauth",
    name: connectionName,
    email: data.email !== undefined ? data.email : null,
    priority: connectionPriority,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    data: extraData,
    createdAt: now,
    updatedAt: now,
  };

  await ProviderConnection.create(connDoc);
  await reorderForProvider(data.provider);

  return docToConn(connDoc);
}

// Critical: OAuth refresh token race — atomic update with $set
export async function updateProviderConnection(id, data = {}) {
  if (!id) return null;
  await getConnection();
  const existingDoc = await ProviderConnection.findById(id).lean();
  if (!existingDoc) return null;

  const existingConn = docToConn(existingDoc);
  const merged = { ...existingConn, ...data, updatedAt: new Date().toISOString() };

  const { id: _id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = merged;

  const updateFields = {
    provider,
    authType,
    name: name ?? null,
    email: email ?? null,
    priority: priority ?? null,
    isActive: isActive !== false,
    data: rest,
    updatedAt: new Date(),
  };

  await ProviderConnection.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true }
  ).lean();

  if (data.priority !== undefined && existingDoc.provider) {
    await reorderForProvider(existingDoc.provider);
  }

  return merged;
}

export async function deleteProviderConnection(id) {
  if (!id) return false;
  await getConnection();
  const doc = await ProviderConnection.findById(id).lean();
  if (!doc) return false;

  await ProviderConnection.deleteOne({ _id: id });
  if (doc.provider) {
    await reorderForProvider(doc.provider);
  }
  return true;
}

export async function deleteProviderConnectionsByProvider(providerId) {
  if (!providerId) return 0;
  await getConnection();
  const res = await ProviderConnection.deleteMany({ provider: providerId });
  return res.deletedCount || 0;
}

export async function reorderProviderConnections(providerId) {
  await reorderForProvider(providerId);
}

export async function cleanupProviderConnections() {
  await getConnection();
  const fieldsToCheck = [
    "displayName", "email", "globalPriority", "defaultModel",
    "accessToken", "refreshToken", "expiresAt", "tokenType",
    "scope", "projectId", "apiKey", "testStatus",
    "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn",
    "consecutiveUseCount",
  ];
  let cleaned = 0;
  const docs = await ProviderConnection.find({}).lean();

  for (const doc of docs) {
    const conn = docToConn(doc);
    let dirty = false;
    for (const f of fieldsToCheck) {
      if (conn[f] === null || conn[f] === undefined) {
        if (f in conn) {
          delete conn[f];
          cleaned++;
          dirty = true;
        }
      }
    }
    if (conn.providerSpecificData && Object.keys(conn.providerSpecificData).length === 0) {
      delete conn.providerSpecificData;
      cleaned++;
      dirty = true;
    }
    if (dirty) {
      const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = conn;
      await ProviderConnection.findByIdAndUpdate(doc._id, {
        $set: {
          data: rest,
          updatedAt: new Date(),
        },
      });
    }
  }
  return cleaned;
}
