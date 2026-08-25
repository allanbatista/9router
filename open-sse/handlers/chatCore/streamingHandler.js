import { FORMATS } from "../../translator/formats.js";
import { needsTranslation } from "../../translator/index.js";
import { createSSETransformStreamWithLogger, createPassthroughStreamWithLogger, snapshotStreamMetrics } from "../../utils/stream.js";
import { pipeWithDisconnect } from "../../utils/streamHandler.js";
import { PROVIDERS } from "../../config/providers.js";
import { STREAM_STALL_TIMEOUT_MS } from "../../config/runtimeConfig.js";
import { buildAbortedResponsesTerminalBytes } from "../../utils/responsesStreamHelpers.js";
import { buildRequestDetail, extractRequestConfig, saveUsageStats, formatDoneLine } from "./requestDetail.js";
import { saveRequestDetail } from "@/lib/usageDb.js";
import { SSE_HEADERS_CORS as SSE_HEADERS } from "../../utils/sseConstants.js";
import { v7 as uuidv7 } from "uuid";
// Codex returns Responses API SSE → which client format to translate INTO, by request sourceFormat.
// Gemini-family all map to ANTIGRAVITY decoder; unknown sources fall back to OPENAI.
const CODEX_SOURCE_TO_TARGET = {
  [FORMATS.OPENAI_RESPONSES]: FORMATS.OPENAI_RESPONSES,
  [FORMATS.CLAUDE]: FORMATS.CLAUDE,
  [FORMATS.ANTIGRAVITY]: FORMATS.ANTIGRAVITY,
  [FORMATS.GEMINI]: FORMATS.ANTIGRAVITY,
  [FORMATS.GEMINI_CLI]: FORMATS.ANTIGRAVITY,
};

/**
 * Determine which SSE transform stream to use based on provider/format.
 */
function buildTransformStream({ provider, sourceFormat, targetFormat, userAgent, reqLogger, toolNameMap, customToolNames, model, connectionId, body, onStreamComplete, apiKey, streamMetrics, onStreamError }) {
  const isDroidCLI = userAgent?.toLowerCase().includes("droid") || userAgent?.toLowerCase().includes("codex-cli");
  // Responses-API providers (e.g. codex) emit Responses SSE → translate into client format
  const isResponsesProvider = PROVIDERS[provider]?.format === FORMATS.OPENAI_RESPONSES;
  const needsCodexTranslation = isResponsesProvider && targetFormat === FORMATS.OPENAI_RESPONSES && !isDroidCLI;

  if (needsCodexTranslation) {
    const codexTarget = CODEX_SOURCE_TO_TARGET[sourceFormat] || FORMATS.OPENAI;
    return createSSETransformStreamWithLogger(FORMATS.OPENAI_RESPONSES, codexTarget, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, streamMetrics, onStreamError);
  }

  if (needsTranslation(targetFormat, sourceFormat)) {
    return createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, streamMetrics, onStreamError);
  }

  return createPassthroughStreamWithLogger(provider, reqLogger, model, connectionId, body, onStreamComplete, apiKey, streamMetrics, onStreamError);
}

/**
 * Handle streaming response — pipe provider SSE through transform stream to client.
 */
export async function handleStreamingResponse({ providerResponse, provider, model, sourceFormat, targetFormat, userAgent, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, reqLogger, toolNameMap, customToolNames, streamController, onStreamComplete, onStreamError, streamDetailId, pxpipe, reqTag, log, streamMetrics }) {
  if (onRequestSuccess) {
    Promise.resolve()
      .then(onRequestSuccess)
      .catch(err => {
        console.error("[ChatCore] onRequestSuccess failed:", err?.message || err);
      });
  }

  // When upstream returns HTML/text instead of SSE (e.g. Cloudflare 5xx error
  // page), piping it through the SSE transform stream causes Next.js
  // "failed to pipe response" and crashes the chat router. Read the body,
  // pull a short human-readable message from the <title>, sanitize it, and
  // return a clean JSON error instead. The message is stripped of HTML tags
  // and clamped so untrusted upstream text never reaches the client verbatim
  // (the UI may render error.message as HTML).
  const upstreamContentType = (providerResponse.headers.get('content-type') || '').toLowerCase();
  if (upstreamContentType && !upstreamContentType.includes('text/event-stream') && !upstreamContentType.includes('application/json')) {
    const bodyText = await providerResponse.text().catch(() => '');
    const titleMatch = bodyText.match(/<title>([^<]+)<\/title>/i);
    const sanitizedTitle = (titleMatch?.[1] || '').replace(/<[^>]*>/g, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
    const shortMsg = sanitizedTitle
      || (bodyText.length < 200 ? bodyText.replace(/<[^>]*>/g, '').trim().slice(0, 160) : `Upstream returned non-SSE response (${upstreamContentType})`);
    const status = providerResponse.status || 502;
    if (log?.errorLine) log.errorLine(reqTag, "✗", `BLOCKED ${status} · ${provider}/${model} · non-SSE (${upstreamContentType})\n    ${shortMsg}`);
    else console.warn(`[STREAM] ${provider} | ${model} | blocked pipe: ${shortMsg} [${status}]`);
    streamController?.handleError?.(new Error(`upstream non-SSE: ${status}`));
    return {
      success: false,
      response: new Response(JSON.stringify({ error: { message: `[${status}]: ${shortMsg}` } }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }),
    };
  }

  const transformStream = buildTransformStream({ provider, sourceFormat, targetFormat, userAgent, reqLogger, toolNameMap, customToolNames, model, connectionId, body, onStreamComplete, apiKey, streamMetrics, onStreamError });

  // Responses passthrough: synthesize response.failed + [DONE] if the stream aborts/stalls before a terminal event
  const isResponsesPassthrough = sourceFormat === FORMATS.OPENAI_RESPONSES && targetFormat === FORMATS.OPENAI_RESPONSES;
  const onAbortTerminal = isResponsesPassthrough ? buildAbortedResponsesTerminalBytes : null;
  const stallTimeoutMs = PROVIDERS[provider]?.stallTimeoutMs || STREAM_STALL_TIMEOUT_MS;
  const transformedBody = pipeWithDisconnect(providerResponse, transformStream, streamController, onAbortTerminal, stallTimeoutMs, streamMetrics);

  saveRequestDetail(buildRequestDetail({
    provider, model, connectionId,
    latency: { ttft: 0, total: Date.now() - requestStartTime },
    tokens: { prompt_tokens: 0, completion_tokens: 0 },
    request: extractRequestConfig(body, stream, clientRawRequest),
    providerRequest: finalBody || translatedBody || null,
    providerResponse: "[Streaming - raw response not captured]",
    response: { content: "[Streaming in progress...]", thinking: null, type: "streaming", termination: "in_progress", metrics: snapshotStreamMetrics(streamMetrics) },
    pxpipe,
    status: "streaming"
  }, { id: streamDetailId })).catch(err => {
    console.error("[RequestDetail] Failed to save streaming request:", err.message);
  });

  return {
    success: true,
    response: new Response(transformedBody, { headers: SSE_HEADERS })
  };
}

/**
 * Build onStreamComplete callback for streaming usage tracking.
 */
export function buildOnStreamComplete({ provider, model, connectionId, apiKey, requestStartTime, body, stream, finalBody, translatedBody, clientRawRequest, pxpipe, reqTag, log, streamMetrics }) {
  const streamDetailId = uuidv7();
  let finalized = false;

  const finalize = ({ termination, contentObj = null, usage = null, ttftAt = null, reason = null, error = null } = {}) => {
    if (finalized) return;
    finalized = true;

    const total = Date.now() - requestStartTime;
    const observedTtftAt = ttftAt || streamMetrics?.ttftAt || null;
    const latency = {
      ttft: observedTtftAt ? Math.max(0, observedTtftAt - requestStartTime) : (termination === "completed" ? total : 0),
      total
    };
    const metrics = snapshotStreamMetrics(streamMetrics);
    const effectiveUsage = usage || streamMetrics?.usage || null;
    const safeThinking = contentObj?.thinking || null;
    const hasToolCall = metrics?.toolCalls?.length > 0;
    const safeContent = contentObj?.content
      || (hasToolCall ? "[Tool-call response]" : termination === "client_closed" ? "[No response bytes observed]" : "[Empty streaming response]");
    const status = (termination === "completed" || (termination === "client_closed" && hasToolCall)) ? "success" : termination === "client_closed" ? "aborted" : "error";
    const errorMessage = error ? (error.message || String(error)) : null;
    const response = {
      content: safeContent,
      thinking: safeThinking,
      type: "streaming",
      termination,
      metrics,
      ...(reason ? { reason: String(reason) } : {}),
      ...(errorMessage ? { error: errorMessage } : {}),
    };

    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId,
      latency,
      tokens: effectiveUsage || { prompt_tokens: 0, completion_tokens: 0 },
      request: extractRequestConfig(body, stream, clientRawRequest),
      providerRequest: finalBody || translatedBody || null,
      providerResponse: {
        content: safeContent,
        thinking: safeThinking,
        rawUsage: effectiveUsage,
        termination,
        metrics,
        _observed: termination === "completed",
        partial: (metrics?.clientBytes || 0) > 0,
      },
      response,
      error: errorMessage,
      pxpipe,
      status
    }, { id: streamDetailId })).catch(err => {
      console.error("[RequestDetail] Failed to update streaming content:", err.message);
    });

    // Persiste o uso mesmo quando o cliente fecha após receber uma chamada de ferramenta parcial.
    saveUsageStats({ provider, model, tokens: effectiveUsage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, label: "STREAM USAGE", silent: true });
    if (termination === "completed" && log?.line) log.line(reqTag, "📊", formatDoneLine({ usage: effectiveUsage, latency }));
  };

  const onStreamComplete = (contentObj, usage, ttftAt) => finalize({
    termination: "completed",
    contentObj,
    usage,
    ttftAt,
  });
  const onStreamDisconnect = ({ reason } = {}) => finalize({ termination: "client_closed", reason });
  const onStreamError = (error) => finalize({ termination: "error", error });

  return { onStreamComplete, onStreamDisconnect, onStreamError, streamDetailId };
}
