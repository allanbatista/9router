import mongoose from "mongoose";

const { Schema } = mongoose;

export const UsageHistorySchema = new Schema(
  {
    timestamp: { type: Date, required: true, index: true },
    provider: { type: String, default: null, index: true },
    model: { type: String, default: null, index: true },
    connectionId: { type: String, default: null, index: true },
    apiKey: { type: String, default: null },
    endpoint: { type: String, default: null },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    status: { type: String, default: null },
    tokens: { type: Schema.Types.Mixed, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  {
    collection: "usageHistory",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

UsageHistorySchema.index({ timestamp: -1 });
UsageHistorySchema.index({ provider: 1, timestamp: -1 });
UsageHistorySchema.index({ model: 1, timestamp: -1 });
UsageHistorySchema.index({ connectionId: 1, timestamp: -1 });

export const UsageHistory =
  mongoose.models.UsageHistory || mongoose.model("UsageHistory", UsageHistorySchema);
export default UsageHistory;
