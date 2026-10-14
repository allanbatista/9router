import mongoose from "mongoose";

const { Schema } = mongoose;

export const KvEntrySchema = new Schema(
  {
    scope: { type: String, required: true },
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "kv",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

KvEntrySchema.index({ scope: 1, key: 1 }, { unique: true });
KvEntrySchema.index({ scope: 1 });

export const KvEntry = mongoose.models.KvEntry || mongoose.model("KvEntry", KvEntrySchema);
export default KvEntry;
