import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const { Schema } = mongoose;

export const ChatMessageSchema = new Schema(
  {
    id: { type: String, default: uuidv4 },
    parentId: { type: String, default: null },
    role: { type: String, required: true, enum: ["user", "assistant", "system"] },
    content: { type: Schema.Types.Mixed, required: true },
    attachments: {
      type: [
        {
          id: { type: String, default: uuidv4 },
          name: { type: String, default: "" },
          type: { type: String, default: "image/png" },
          dataUrl: { type: String, required: true },
        },
      ],
      default: () => [],
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const ChatSessionSchema = new Schema(
  {
    _id: { type: String, default: uuidv4 },
    title: { type: String, default: "New chat" },
    modelId: { type: String, required: true },
    providerId: { type: String, default: null },
    systemPrompt: { type: String, default: null },
    messages: { type: [ChatMessageSchema], default: () => [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "chatSessions",
    strict: false,
    timestamps: false,
    versionKey: false,
  }
);

// Indexes
ChatSessionSchema.index({ updatedAt: -1 });
ChatSessionSchema.index({ createdAt: -1 });

export const ChatSession = mongoose.models.ChatSession || mongoose.model("ChatSession", ChatSessionSchema);
export default ChatSession;
