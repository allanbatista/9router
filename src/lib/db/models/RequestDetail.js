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
RequestDetailSchema.index({ "agentMetadata.agent-name": 1, timestamp: -1 });
RequestDetailSchema.index({ "agentMetadata.os": 1, timestamp: -1 });
RequestDetailSchema.index({ "agentMetadata.hostname": 1, timestamp: -1 });
RequestDetailSchema.index({ "agentMetadata.$**": 1 });

export const RequestDetail =
  mongoose.models.RequestDetail || mongoose.model("RequestDetail", RequestDetailSchema);
export default RequestDetail;
