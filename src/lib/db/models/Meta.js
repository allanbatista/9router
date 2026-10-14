import mongoose from "mongoose";

const { Schema } = mongoose;

export const MetaSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "_meta",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

export const Meta = mongoose.models.Meta || mongoose.model("Meta", MetaSchema);
export default Meta;
