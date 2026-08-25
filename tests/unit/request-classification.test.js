import { describe, expect, it } from "vitest";
import { classifyRequest, getRequestSessionIdentity } from "../../src/shared/utils/requestClassification.js";

describe("request classification", () => {
  it("classifies a streamed agent tool-call and preserves the provider request type", () => {
    const result = classifyRequest({
      agentMetadata: { "agent-name": "pi" },
      providerRequest: {
        requestType: "agent",
        request: { sessionId: "session-42" },
      },
      response: {
        metrics: {
          toolCalls: [{ id: "call-1", name: "bash", index: 0 }],
        },
      },
    });

    expect(result).toMatchObject({
      requestType: "tool_call",
      agentRequestType: "agent",
      isToolCall: true,
      toolCallCount: 1,
      toolCallNames: ["bash"],
      sessionId: "session-42",
    });
  });

  it("detects OpenAI Responses function_call items without stream metrics", () => {
    const result = classifyRequest({
      providerRequest: { requestType: "agent" },
      providerResponse: {
        output: [{ type: "function_call", call_id: "call-2", name: "read_file" }],
      },
    });

    expect(result.requestType).toBe("tool_call");
    expect(result.toolCallNames).toEqual(["read_file"]);
  });

  it("extracts a session from client agent metadata and conversation IDs", () => {
    expect(getRequestSessionIdentity({
      request: { _agent_metadata: [{ key: "session-id", value: "client-session" }] },
    }).sessionId).toBe("client-session");

    expect(getRequestSessionIdentity({
      providerRequest: { requestId: "agent/01234567-89ab-cdef-0123-456789abcdef/turn/1" },
    }).conversationId).toBe("01234567-89ab-cdef-0123-456789abcdef");
  });

  it("keeps normal agent requests distinct from tool-call requests", () => {
    const result = classifyRequest({ providerRequest: { requestType: "agent" } });
    expect(result).toMatchObject({ requestType: "agent", agentRequestType: "agent", isToolCall: false, toolCallCount: 0 });
  });
});
