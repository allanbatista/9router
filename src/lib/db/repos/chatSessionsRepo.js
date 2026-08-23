import { v4 as uuidv4 } from "uuid";
import { getConnection } from "../connection.js";
import { ChatSession } from "../models/ChatSession.js";

function normalizeMessage(msg) {
  if (!msg) return null;
  return {
    id: msg.id || uuidv4(),
    parentId: msg.parentId ?? null,
    role: msg.role,
    content: msg.content,
    attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
    createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : (msg.createdAt || new Date().toISOString()),
  };
}

function docToChatSession(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    title: doc.title || "New chat",
    modelId: doc.modelId,
    providerId: doc.providerId ?? null,
    systemPrompt: doc.systemPrompt ?? null,
    messages: Array.isArray(doc.messages) ? doc.messages.map(normalizeMessage) : [],
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : (doc.updatedAt || new Date().toISOString()),
  };
}

function docToChatSessionSummary(doc) {
  if (!doc) return null;
  const messages = Array.isArray(doc.messages) ? doc.messages : [];
  return {
    id: doc._id,
    title: doc.title || "New chat",
    modelId: doc.modelId,
    providerId: doc.providerId ?? null,
    systemPrompt: doc.systemPrompt ?? null,
    messageCount: messages.length,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : (doc.updatedAt || new Date().toISOString()),
  };
}

export async function getChatSessions() {
  await getConnection();
  const docs = await ChatSession.find({}).sort({ updatedAt: -1 }).lean();
  return docs.map(docToChatSessionSummary);
}

export async function getChatSessionById(id) {
  if (!id) return null;
  await getConnection();
  const doc = await ChatSession.findById(id).lean();
  return docToChatSession(doc);
}

export async function createChatSession(data = {}) {
  await getConnection();
  const now = new Date();
  const rawMessages = Array.isArray(data.messages) ? data.messages : [];
  const sessionDoc = {
    _id: data.id || data._id || uuidv4(),
    title: data.title || "New chat",
    modelId: data.modelId,
    providerId: data.providerId ?? null,
    systemPrompt: data.systemPrompt ?? null,
    messages: rawMessages.map(normalizeMessage),
    createdAt: data.createdAt ? new Date(data.createdAt) : now,
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : now,
  };

  await ChatSession.create(sessionDoc);
  return docToChatSession(sessionDoc);
}

export async function updateChatSession(id, data = {}) {
  if (!id) return null;
  await getConnection();
  const existingDoc = await ChatSession.findById(id).lean();
  if (!existingDoc) return null;

  const existing = docToChatSession(existingDoc);
  const updatedMessages = data.messages !== undefined
    ? (Array.isArray(data.messages) ? data.messages.map(normalizeMessage) : [])
    : existing.messages;

  const now = new Date();
  const updatePayload = {
    updatedAt: now,
  };

  if (data.title !== undefined) updatePayload.title = data.title;
  if (data.modelId !== undefined) updatePayload.modelId = data.modelId;
  if (data.providerId !== undefined) updatePayload.providerId = data.providerId;
  if (data.systemPrompt !== undefined) updatePayload.systemPrompt = data.systemPrompt;
  if (data.messages !== undefined) updatePayload.messages = updatedMessages;

  const updatedDoc = await ChatSession.findByIdAndUpdate(
    id,
    { $set: updatePayload },
    { new: true }
  ).lean();

  return docToChatSession(updatedDoc || { ...existingDoc, ...updatePayload, _id: id });
}

export async function deleteChatSession(id) {
  if (!id) return false;
  await getConnection();
  const res = await ChatSession.deleteOne({ _id: id });
  return (res.deletedCount || 0) > 0;
}

export async function exportChatSessions() {
  await getConnection();
  const docs = await ChatSession.find({}).sort({ createdAt: 1 }).lean();
  return docs.map(docToChatSession);
}

export async function importChatSessions(sessions = []) {
  if (!Array.isArray(sessions)) return [];
  await getConnection();
  if (sessions.length === 0) return [];

  const sessionDocs = sessions.map((s) => {
    const rawMessages = Array.isArray(s.messages) ? s.messages : [];
    return {
      _id: s.id || s._id || uuidv4(),
      title: s.title || "New chat",
      modelId: s.modelId,
      providerId: s.providerId ?? null,
      systemPrompt: s.systemPrompt ?? null,
      messages: rawMessages.map(normalizeMessage),
      createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
      updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
    };
  });

  await ChatSession.insertMany(sessionDocs, { ordered: false });
  return sessionDocs.map(docToChatSession);
}
