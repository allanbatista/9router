import mongoose from "mongoose";

const { Schema } = mongoose;

export const ComboAffinitySchema = new Schema(
  {
    comboName: { type: String, required: true },
    cacheKeyHash: { type: String, required: true },
    rawKey: { type: String, default: null },
    selectedModel: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
    hitCount: { type: Number, default: 1 },
  },
  {
    collection: "comboAffinity",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

ComboAffinitySchema.index({ comboName: 1, cacheKeyHash: 1 }, { unique: true });
ComboAffinitySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 1800 });

export const ComboAffinity =
  mongoose.models.ComboAffinity || mongoose.model("ComboAffinity", ComboAffinitySchema);
export default ComboAffinity;
