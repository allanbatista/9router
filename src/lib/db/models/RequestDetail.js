import mongoose from "mongoose";
import { v7 as uuidv7 } from "uuid";

const { Schema } = mongoose;

export const RequestDetailSchema = new Schema(
  {
    _id: { type: String, default: uuidv7 },
    provider: { type: String, default: null, index: true },
    model: { type: String, default: null, index: true },
    connectionId: { type: String, default: null, index: true },
    status: { type: String, default: null },
    requestType: { type: String, default: "chat", index: true },
    agentRequestType: { type: String, default: null, index: true },
    isToolCall: { type: Boolean, default: false, index: true },
    toolCallCount: { type: Number, default: 0 },
    toolCallNames: { type: [String], default: () => [] },
    sessionId: { type: String, default: null, index: true },
    rawSessionId: { type: String, default: null },
    cacheKey: { type: String, default: null },
    conversationId: { type: String, default: null, index: true },
    agentMetadata: { type: Schema.Types.Mixed, default: () => ({}) },
    data: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  {
    collection: "requestDetails",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

RequestDetailSchema.index({ timestamp: -1 });
RequestDetailSchema.index({ provider: 1, timestamp: -1 });
RequestDetailSchema.index({ model: 1, timestamp: -1 });
RequestDetailSchema.index({ connectionId: 1, timestamp: -1 });
RequestDetailSchema.index({ sessionId: 1, timestamp: -1 });
RequestDetailSchema.index({ requestType: 1, timestamp: -1 });
RequestDetailSchema.index({ "agentMetadata.agent-name": 1, timestamp: -1 });
RequestDetailSchema.index({ "agentMetadata.os": 1, timestamp: -1 });
RequestDetailSchema.index({ "agentMetadata.hostname": 1, timestamp: -1 });
RequestDetailSchema.index({ "agentMetadata.$**": 1 });

export const RequestDetail =
  mongoose.models.RequestDetail || mongoose.model("RequestDetail", RequestDetailSchema);
export default RequestDetail;
