import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const { Schema } = mongoose;

export const ProviderNodeSchema = new Schema(
  {
    _id: { type: String, default: uuidv4 },
    type: { type: String, index: true },
    name: { type: String, default: null },
    prefix: { type: String, default: null },
    apiType: { type: String, default: null },
    baseUrl: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "providerNodes",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

export const ProviderNode =
  mongoose.models.ProviderNode || mongoose.model("ProviderNode", ProviderNodeSchema);
export default ProviderNode;
