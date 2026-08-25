function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value) {
  const text = value == null ? "" : String(value).trim();
  return text || null;
}

function addToolCall(calls, call, fallbackIndex = null) {
  if (!call || typeof call !== "object") return;
  const fn = asObject(call.function);
  const item = asObject(call.item);
  const id = asString(call.id || call.call_id || call.toolCallId || item.id);
  const name = asString(fn.name || call.name || item.name);
  const index = Number.isInteger(call.index) ? call.index : fallbackIndex;
  if (!id && !name && index == null) return;

  const existing = calls.find((entry) => (
    (id && entry.id === id) || (!id && entry.name === name && entry.index === index)
  ));
  if (existing) {
    if (!existing.name && name) existing.name = name;
    if (existing.index == null && index != null) existing.index = index;
    return;
  }
  calls.push({ id, name, index });
}

function collectToolCalls(payload, calls) {
  const value = asObject(payload);
  const metrics = asObject(value.metrics);
  for (const [index, call] of (Array.isArray(metrics.toolCalls) ? metrics.toolCalls : []).entries()) {
    addToolCall(calls, call, index);
  }

  for (const [index, choice] of (Array.isArray(value.choices) ? value.choices : []).entries()) {
    const message = asObject(choice.message);
    for (const call of message.tool_calls || []) addToolCall(calls, call, index);
    for (const call of choice.delta?.tool_calls || []) addToolCall(calls, call, index);
  }

  for (const [index, item] of (Array.isArray(value.output) ? value.output : []).entries()) {
    if (item?.type === "function_call" || item?.type === "custom_tool_call") addToolCall(calls, item, index);
  }

  for (const [index, block] of (Array.isArray(value.content) ? value.content : []).entries()) {
    if (block?.type === "tool_use") addToolCall(calls, block, index);
  }

  for (const [index, part] of (value.candidates?.[0]?.content?.parts || []).entries()) {
    if (part?.functionCall) addToolCall(calls, part.functionCall, index);
  }
}

export function getToolCalls(detail) {
  const source = asObject(detail);
  const data = asObject(source.data);
  const calls = [];
  if (Array.isArray(source.toolCalls)) {
    for (const [index, call] of source.toolCalls.entries()) addToolCall(calls, call, index);
  } else if (Number(source.toolCallCount) > 0) {
    for (const [index, name] of (source.toolCallNames || []).entries()) {
      addToolCall(calls, { name }, index);
    }
  }
  collectToolCalls(source.response, calls);
  collectToolCalls(source.providerResponse, calls);
  collectToolCalls(data.response, calls);
  collectToolCalls(data.providerResponse, calls);
  return calls;
}

export function getAgentRequestType(detail) {
  const source = asObject(detail);
  const data = asObject(source.data);
  const providerRequest = asObject(source.providerRequest || data.providerRequest);
  const request = asObject(providerRequest.request);
  return asString(
    source.agentRequestType
      || data.agentRequestType
      || providerRequest.requestType
      || request.requestType
  );
}

export function getRequestSessionIdentity(detail) {
  const source = asObject(detail);
  const data = asObject(source.data);
  const request = asObject(source.request || data.request);
  const providerRequest = asObject(source.providerRequest || data.providerRequest);
  const providerPayload = asObject(providerRequest.request);
  const metadata = asObject(source.agentMetadata || data.agentMetadata);

  let conversationId = asString(source.conversationId || data.conversationId || request.conversation_id || providerRequest.conversation_id);
  if (!conversationId && providerRequest.requestId) {
    conversationId = String(providerRequest.requestId).match(/^agent\/([0-9a-f-]{36})\//i)?.[1] || null;
  }

  const providerSession = asString(
    providerPayload.sessionId
      || providerRequest.sessionId
      || providerRequest.prompt_cache_key
      || providerRequest.session_id
      || providerRequest.conversation_id
  );
  const rawSession = asString(
    request.prompt_cache_key
      || (Array.isArray(request._agent_metadata)
        ? request._agent_metadata.find((item) => item?.key === "session-id")?.value
        : null)
      || request.session_id
      || request.conversation_id
      || metadata["session-id"]
  );
  const sessionId = asString(source.sessionId || data.sessionId || providerSession || rawSession || conversationId);

  return {
    sessionId,
    rawSessionId: rawSession || providerSession || null,
    cacheKey: sessionId,
    conversationId,
  };
}

export function classifyRequest(detail) {
  const source = asObject(detail);
  const toolCalls = getToolCalls(source);
  const agentRequestType = getAgentRequestType(source);
  const session = getRequestSessionIdentity(source);
  const requestType = toolCalls.length > 0 ? "tool_call" : (agentRequestType || "chat");

  return {
    requestType,
    agentRequestType,
    isToolCall: toolCalls.length > 0,
    toolCallCount: toolCalls.length,
    toolCallNames: [...new Set(toolCalls.map((call) => call.name).filter(Boolean))],
    toolCalls,
    ...session,
  };
}
