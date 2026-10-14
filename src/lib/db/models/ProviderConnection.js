import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const { Schema } = mongoose;

export const ProviderConnectionSchema = new Schema(
  {
    _id: { type: String, default: uuidv4 },
    provider: { type: String, required: true, index: true },
    authType: { type: String, default: "oauth" },
    name: { type: String, default: null },
    email: { type: String, default: null },
    priority: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    data: { type: Schema.Types.Mixed, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "providerConnections",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

ProviderConnectionSchema.index({ provider: 1, isActive: 1 });
ProviderConnectionSchema.index({ provider: 1, priority: 1 });

export const ProviderConnection =
  mongoose.models.ProviderConnection || mongoose.model("ProviderConnection", ProviderConnectionSchema);
export default ProviderConnection;
