import mongoose from "mongoose";

const { Schema } = mongoose;

export const SettingSchema = new Schema(
  {
    _id: { type: String, default: "global" },
    data: { type: Schema.Types.Mixed, default: () => ({}) },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "settings",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

export const Setting = mongoose.models.Setting || mongoose.model("Setting", SettingSchema);
export default Setting;
