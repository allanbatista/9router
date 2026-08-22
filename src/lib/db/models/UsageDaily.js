import mongoose from "mongoose";

const { Schema } = mongoose;

export const UsageDailySchema = new Schema(
  {
    dateKey: { type: String, required: true, unique: true },
    requests: { type: Number, default: 0 },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    byProvider: { type: Schema.Types.Mixed, default: () => ({}) },
    byModel: { type: Schema.Types.Mixed, default: () => ({}) },
    byAccount: { type: Schema.Types.Mixed, default: () => ({}) },
    byApiKey: { type: Schema.Types.Mixed, default: () => ({}) },
    byEndpoint: { type: Schema.Types.Mixed, default: () => ({}) },
    byAgentMetadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  {
    collection: "usageDaily",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

export const UsageDaily =
  mongoose.models.UsageDaily || mongoose.model("UsageDaily", UsageDailySchema);
export default UsageDaily;
