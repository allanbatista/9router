import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const { Schema } = mongoose;

export const ComboSchema = new Schema(
  {
    _id: { type: String, default: uuidv4 },
    name: { type: String, required: true, unique: true },
    kind: { type: String, default: null },
    models: { type: [Schema.Types.Mixed], default: () => [] },
    defaultEffort: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "combos",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

ComboSchema.index({ createdAt: 1 });

export const Combo = mongoose.models.Combo || mongoose.model("Combo", ComboSchema);
export default Combo;
