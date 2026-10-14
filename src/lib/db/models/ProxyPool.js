import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const { Schema } = mongoose;

export const ProxyPoolSchema = new Schema(
  {
    _id: { type: String, default: uuidv4 },
    name: { type: String, default: null },
    proxyUrl: { type: String, default: null },
    isActive: { type: Boolean, default: true, index: true },
    testStatus: { type: String, default: "unknown", index: true },
    data: { type: Schema.Types.Mixed, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "proxyPools",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

export const ProxyPool =
  mongoose.models.ProxyPool || mongoose.model("ProxyPool", ProxyPoolSchema);
export default ProxyPool;
