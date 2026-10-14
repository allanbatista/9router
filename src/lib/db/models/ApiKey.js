import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const { Schema } = mongoose;

export const ApiKeySchema = new Schema(
  {
    _id: { type: String, default: uuidv4 },
    key: { type: String, required: true, unique: true },
    name: { type: String, default: null },
    machineId: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "apiKeys",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

ApiKeySchema.index({ createdAt: 1 });

export const ApiKey = mongoose.models.ApiKey || mongoose.model("ApiKey", ApiKeySchema);
export default ApiKey;
