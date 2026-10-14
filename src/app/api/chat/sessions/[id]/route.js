import { NextResponse } from "next/server";
import { getChatSessionById, updateChatSession, deleteChatSession } from "@/lib/localDb";

export const dynamic = "force-dynamic";

// GET /api/chat/sessions/[id] - Get chat session details by ID
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const session = await getChatSessionById(id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Error fetching chat session:", error);
    return NextResponse.json({ error: "Failed to fetch chat session" }, { status: 500 });
  }
}

// PATCH /api/chat/sessions/[id] - Update chat session
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { title, modelId, providerId, systemPrompt, messages } = body;

    const updatePayload = {};
    if (title !== undefined) updatePayload.title = title;
    if (modelId !== undefined) updatePayload.modelId = modelId;
    if (providerId !== undefined) updatePayload.providerId = providerId;
    if (systemPrompt !== undefined) updatePayload.systemPrompt = systemPrompt;
    if (messages !== undefined) updatePayload.messages = messages;

    const session = await updateChatSession(id, updatePayload);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Error updating chat session:", error);
    return NextResponse.json({ error: "Failed to update chat session" }, { status: 500 });
  }
}

// DELETE /api/chat/sessions/[id] - Delete chat session
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const success = await deleteChatSession(id);

    if (!success) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting chat session:", error);
    return NextResponse.json({ error: "Failed to delete chat session" }, { status: 500 });
  }
}
