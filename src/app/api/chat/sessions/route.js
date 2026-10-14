import { NextResponse } from "next/server";
import { getChatSessions, createChatSession } from "@/lib/localDb";

export const dynamic = "force-dynamic";

// GET /api/chat/sessions - List all chat sessions
export async function GET() {
  try {
    const sessions = await getChatSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    return NextResponse.json({ error: "Failed to fetch chat sessions" }, { status: 500 });
  }
}

// POST /api/chat/sessions - Create new chat session
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { title, modelId, providerId, systemPrompt, messages } = body;

    const session = await createChatSession({
      title,
      modelId: modelId || "default",
      providerId: providerId ?? null,
      systemPrompt: systemPrompt ?? null,
      messages: Array.isArray(messages) ? messages : [],
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("Error creating chat session:", error);
    return NextResponse.json({ error: "Failed to create chat session" }, { status: 500 });
  }
}
