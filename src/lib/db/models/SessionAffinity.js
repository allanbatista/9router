import mongoose from "mongoose";

const { Schema } = mongoose;

export const SessionAffinitySchema = new Schema(
  {
    provider: { type: String, required: true },
    model: { type: String, required: true },
    cacheKeyHash: { type: String, required: true },
    rawKey: { type: String, default: null },
    connectionId: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
    hitCount: { type: Number, default: 1 },
  },
  {
    collection: "sessionAffinity",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

SessionAffinitySchema.index({ provider: 1, model: 1, cacheKeyHash: 1 }, { unique: true });
SessionAffinitySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 1800 });
SessionAffinitySchema.index({ connectionId: 1 });

export const SessionAffinity =
  mongoose.models.SessionAffinity || mongoose.model("SessionAffinity", SessionAffinitySchema);
export default SessionAffinity;
