import { translateResponse, initState } from "../translator/index.js";
import { FORMATS } from "../translator/formats.js";
import { trackPendingRequest, appendRequestLog } from "@/lib/usageDb.js";
import { extractUsage, mergeUsage, hasValidUsage, estimateUsage, logUsage, addBufferToUsage, filterUsageForFormat, COLORS } from "./usageTracking.js";
import { parseSSELine, hasValuableContent, fixInvalidId, formatSSE } from "./streamHelpers.js";
import { getOpenAIResponsesEventName, isOpenAIResponsesTerminalEvent, formatIncompleteOpenAIResponsesStreamFailure } from "./responsesStreamHelpers.js";
import { dbg, isDebugEnabled } from "./debugLog.js";

import { SSE_DONE, SSE_HEADERS, SSE_HEADERS_NO_BUFFER } from "./sseConstants.js";

export { COLORS, formatSSE };
export { SSE_DONE, SSE_HEADERS, SSE_HEADERS_NO_BUFFER };

// sharedEncoder is stateless — safe to share across streams
const sharedEncoder = new TextEncoder();

/**
 * Stream modes
 */
const STREAM_MODE = {
  TRANSLATE: "translate",    // Full translation between formats
  PASSTHROUGH: "passthrough" // No translation, normalize output, extract usage
};

export function createStreamMetrics() {
  return {
    providerChunks: 0,
    providerBytes: 0,
    clientChunks: 0,
    clientBytes: 0,
    ttftAt: null,
    upstreamEnded: false,
    usage: null,
    toolCalls: [],
  };
}

export function snapshotStreamMetrics(metrics) {
  if (!metrics) return null;
  return {
    providerChunks: metrics.providerChunks || 0,
    providerBytes: metrics.providerBytes || 0,
    clientChunks: metrics.clientChunks || 0,
    clientBytes: metrics.clientBytes || 0,
    upstreamEnded: metrics.upstreamEnded === true,
    toolCalls: Array.isArray(metrics.toolCalls)
      ? metrics.toolCalls.map(({ id, name, index }) => ({ id, name, index }))
      : [],
  };
}

function recordToolCall(metrics, call) {
  if (!metrics || !call) return;
  const id = call.id || call.call_id || call.toolCallId || null;
  const name = call.function?.name || call.name || call.item?.name || null;
  const index = Number.isInteger(call.index) ? call.index : null;
  if (!id && !name && index === null) return;

  const existing = metrics.toolCalls.find((item) => (
    (id && item.id === id) || (!id && item.name === name && item.index === index)
  ));
  if (existing) {
    if (!existing.name && name) existing.name = name;
    if (existing.index === null && index !== null) existing.index = index;
    return;
  }
  metrics.toolCalls.push({ id, name, index });
}

function recordToolCalls(item, metrics) {
  if (!item || !metrics) return;

  for (const choice of item.choices || []) {
    for (const call of choice.delta?.tool_calls || []) recordToolCall(metrics, call);
  }

  if (item.type === "content_block_start" && item.content_block?.type === "tool_use") {
    recordToolCall(metrics, item.content_block);
  }

  if (item.type === "response.output_item.added" && item.item?.type === "function_call") {
    recordToolCall(metrics, item.item);
  }

  for (const part of item.candidates?.[0]?.content?.parts || []) {
    if (part.functionCall) recordToolCall(metrics, part.functionCall);
  }
}

function enqueueOutput(controller, output, metrics, item = null) {
  const bytes = sharedEncoder.encode(output);
  if (metrics) {
    metrics.clientChunks++;
    metrics.clientBytes += bytes.byteLength;
    recordToolCalls(item, metrics);
  }
  controller.enqueue(bytes);
}

/**
 * Create unified SSE transform stream
 * @param {object} options
 * @param {string} options.mode - Stream mode: translate, passthrough
 * @param {string} options.targetFormat - Provider format (for translate mode)
 * @param {string} options.sourceFormat - Client format (for translate mode)
 * @param {string} options.provider - Provider name
 * @param {object} options.reqLogger - Request logger instance
 * @param {string} options.model - Model name
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @param {object} options.body - Request body (for input token estimation)
 * @param {function} options.onStreamComplete - Callback when stream completes (content, usage)
 * @param {string} options.apiKey - API key for usage tracking
 */
export function createSSEStream(options = {}) {
  const {
    mode = STREAM_MODE.TRANSLATE,
    targetFormat,
    sourceFormat,
    provider = null,
    reqLogger = null,
    toolNameMap = null,
    customToolNames = null,
    model = null,
    connectionId = null,
    body = null,
    onStreamComplete = null,
    apiKey = null,
    streamMetrics = null,
    onStreamError = null
  } = options;

  let buffer = "";
  let usage = null;

  // Per-stream decoder with stream:true to correctly handle multi-byte chars split across chunks
  const decoder = new TextDecoder("utf-8", { fatal: false });

  const state = mode === STREAM_MODE.TRANSLATE
    ? { ...initState(sourceFormat), provider, toolNameMap, customToolNames: new Set(customToolNames || []), model }
    : null;

  let totalContentLength = 0;
  let accumulatedContent = "";
  let accumulatedThinking = "";
  let ttftAt = null;
  let sseLineCount = 0;
  let sseEmittedCount = 0;
  const eventTypeCounts = {};

  // Track Responses API event framing for same-format passthrough (codex)
  let currentOpenAIResponsesEvent = null;
  let openAIResponsesTerminalSeen = false;
  let openAIResponsesDoneSent = false;
  let streamDoneSent = false;  // track duplicate [DONE] across transform + flush

  return new TransformStream({
    transform(chunk, controller) {
      if (!ttftAt) {
        ttftAt = Date.now();
        if (streamMetrics) streamMetrics.ttftAt = ttftAt;
      }
      const text = decoder.decode(chunk, { stream: true });
      buffer += text;
      reqLogger?.appendProviderChunk?.(text);

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (isDebugEnabled && trimmed) {
          sseLineCount++;
          if (trimmed.startsWith("event:")) {
            const evt = trimmed.slice(6).trim();
            eventTypeCounts[evt] = (eventTypeCounts[evt] || 0) + 1;
          }
        }

        // Capture Responses API event name to preserve framing in same-format passthrough
        if (mode === STREAM_MODE.TRANSLATE && targetFormat === FORMATS.OPENAI_RESPONSES && trimmed.startsWith("event:")) {
          currentOpenAIResponsesEvent = trimmed.slice(6).trim();
        }

        // Passthrough mode: normalize and forward
        if (mode === STREAM_MODE.PASSTHROUGH) {
          let output;
          let injectedUsage = false;
          let parsedForMetrics = null;

          if (trimmed.startsWith("data:") && trimmed.slice(5).trim() !== "[DONE]") {
            try {
              const parsed = JSON.parse(trimmed.slice(5).trim());
              parsedForMetrics = parsed;

              const idFixed = fixInvalidId(parsed);

              // Ensure OpenAI-required fields are present on streaming chunks (Letta compat)
              let fieldsInjected = false;
              if (parsed.choices !== undefined) {
                if (!parsed.object) { parsed.object = "chat.completion.chunk"; fieldsInjected = true; }
                if (!parsed.created) { parsed.created = Math.floor(Date.now() / 1000); fieldsInjected = true; }
              }

              // Strip Azure-specific non-standard fields from streaming chunks
              if (parsed.prompt_filter_results !== undefined) {
                delete parsed.prompt_filter_results;
                fieldsInjected = true;
              }
              if (parsed?.choices) {
                for (const choice of parsed.choices) {
                  if (choice.content_filter_results !== undefined) {
                    delete choice.content_filter_results;
                    fieldsInjected = true;
                  }
                }
              }

              // Strip empty tool_calls arrays that break AI SDK reasoning tracking.
              // Some providers (e.g. CodeBuddy CN) include `"tool_calls": []` in
              // every streaming delta. @ai-sdk/openai-compatible checks
              // `delta.tool_calls != null` — an empty array passes this check,
              // causing premature `reasoning-end` on every chunk.
              if (parsed?.choices) {
                for (const choice of parsed.choices) {
                  if (choice.delta?.tool_calls && Array.isArray(choice.delta.tool_calls) && choice.delta.tool_calls.length === 0) {
                    delete choice.delta.tool_calls;
                    fieldsInjected = true;
                  }
                }
              }

              if (!hasValuableContent(parsed, FORMATS.OPENAI)) {
                continue;
              }

              const delta = parsed.choices?.[0]?.delta;
              const content = delta?.content;
              const reasoning = delta?.reasoning_content;
              if (content && typeof content === "string") {
                totalContentLength += content.length;
                accumulatedContent += content;
              }
              if (reasoning && typeof reasoning === "string") {
                totalContentLength += reasoning.length;
                accumulatedThinking += reasoning;
              }

              const extracted = extractUsage(parsed);
              if (extracted) {
                usage = mergeUsage(usage, extracted);
                if (streamMetrics) streamMetrics.usage = usage;
              }

              const isFinishChunk = parsed.choices?.[0]?.finish_reason;
              if (isFinishChunk && !hasValidUsage(parsed.usage)) {
                const estimated = estimateUsage(body, totalContentLength, FORMATS.OPENAI);
                parsed.usage = filterUsageForFormat(estimated, FORMATS.OPENAI);
                output = `data: ${JSON.stringify(parsed)}\n`;
                usage = estimated;
                injectedUsage = true;
              } else if (isFinishChunk && usage) {
                const buffered = addBufferToUsage(usage);
                parsed.usage = filterUsageForFormat(buffered, FORMATS.OPENAI);
                output = `data: ${JSON.stringify(parsed)}\n`;
                injectedUsage = true;
              } else if (idFixed || fieldsInjected) {
                output = `data: ${JSON.stringify(parsed)}\n`;
                injectedUsage = true;
              }
            } catch {
              // Skip non-JSON data lines silently — don't forward garbage to clients.
              // Upstream providers sometimes return plain-text errors (HTML, rate-limit
              // messages) in the SSE stream that would break downstream JSON decoders.
              continue;
            }
          }

          if (!injectedUsage) {
            if (line.startsWith("data:") && !line.startsWith("data: ")) {
              output = "data: " + line.slice(5) + "\n";
            } else {
              output = line + "\n";
            }
          }

          reqLogger?.appendConvertedChunk?.(output);
          enqueueOutput(controller, output, streamMetrics, parsedForMetrics);
          continue;
        }

        // Translate mode
        if (!trimmed) continue;

        const parsed = parseSSELine(trimmed, targetFormat);
        if (!parsed) continue;

        // Responses API same-format passthrough: preserve event framing + track terminal state
        const isOpenAIResponsesStream = targetFormat === FORMATS.OPENAI_RESPONSES;
        const keepsOpenAIResponsesFormat = isOpenAIResponsesStream && sourceFormat === FORMATS.OPENAI_RESPONSES;
        const openAIResponsesEventName = isOpenAIResponsesStream
          ? getOpenAIResponsesEventName(currentOpenAIResponsesEvent, parsed)
          : null;

        if (isOpenAIResponsesStream && isOpenAIResponsesTerminalEvent(openAIResponsesEventName, parsed)) {
          openAIResponsesTerminalSeen = true;
        }

        // For Ollama: done=true is the final chunk with finish_reason/usage, must translate
        // For other formats: done=true is the [DONE] sentinel, skip
        if (parsed && parsed.done && targetFormat !== FORMATS.OLLAMA) {
          // Synthesize response.failed if the Responses stream never sent a terminal event
          if (keepsOpenAIResponsesFormat && !openAIResponsesTerminalSeen) {
            const failedOutput = formatIncompleteOpenAIResponsesStreamFailure();
            reqLogger?.appendConvertedChunk?.(failedOutput);
            enqueueOutput(controller, failedOutput, streamMetrics);
            openAIResponsesTerminalSeen = true;
            sseEmittedCount++;
          }

          if (keepsOpenAIResponsesFormat && !streamDoneSent) {
            const doneOutput = "data: [DONE]\n\n";
            reqLogger?.appendConvertedChunk?.(doneOutput);
            enqueueOutput(controller, doneOutput, streamMetrics);
          }
          streamDoneSent = true;
          if (keepsOpenAIResponsesFormat) openAIResponsesDoneSent = true;
          continue;
        }

        // Claude format - content
        if (parsed.delta?.text) {
          totalContentLength += parsed.delta.text.length;
          accumulatedContent += parsed.delta.text;
        }
        // Claude format - thinking
        if (parsed.delta?.thinking) {
          totalContentLength += parsed.delta.thinking.length;
          accumulatedThinking += parsed.delta.thinking;
        }
        
        // OpenAI format - content
        if (parsed.choices?.[0]?.delta?.content) {
          totalContentLength += parsed.choices[0].delta.content.length;
          accumulatedContent += parsed.choices[0].delta.content;
        }
        // OpenAI format - reasoning
        if (parsed.choices?.[0]?.delta?.reasoning_content) {
          totalContentLength += parsed.choices[0].delta.reasoning_content.length;
          accumulatedThinking += parsed.choices[0].delta.reasoning_content;
        }
        
        // Gemini format
        if (parsed.candidates?.[0]?.content?.parts) {
          for (const part of parsed.candidates[0].content.parts) {
            if (part.text && typeof part.text === "string") {
              totalContentLength += part.text.length;
              // Check if this is thinking content
              if (part.thought === true) {
                accumulatedThinking += part.text;
              } else {
                accumulatedContent += part.text;
              }
            }
          }
        }

        // Extract usage
        const extracted = extractUsage(parsed);
        if (extracted) state.usage = mergeUsage(state.usage, extracted); // Keep original usage for logging
        if (streamMetrics) streamMetrics.usage = state?.usage || usage;

        // Responses same-format passthrough: re-emit with original event framing
        if (keepsOpenAIResponsesFormat && openAIResponsesEventName) {
          const output = formatSSE({ event: openAIResponsesEventName, data: parsed }, sourceFormat);
          reqLogger?.appendConvertedChunk?.(output);
          enqueueOutput(controller, output, streamMetrics, parsed);
          currentOpenAIResponsesEvent = null;
          sseEmittedCount++;
          continue;
        }

        currentOpenAIResponsesEvent = null;

        // Translate: targetFormat -> openai -> sourceFormat
        const translated = translateResponse(targetFormat, sourceFormat, parsed, state);

        // Log OpenAI intermediate chunks (if available)
        if (translated?._openaiIntermediate) {
          for (const item of translated._openaiIntermediate) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }
        }

        if (translated?.length > 0) {
          for (const item of translated) {
            if (item === null || item === undefined) continue;
            // Capture accumulated content/thinking from translated chunks if not already captured from upstream
            if (item.choices?.[0]?.delta?.content) {
              accumulatedContent += item.choices[0].delta.content;
            }
            if (item.choices?.[0]?.delta?.reasoning_content) {
              accumulatedThinking += item.choices[0].delta.reasoning_content;
            }
            if (item.delta?.text) {
              accumulatedContent += item.delta.text;
            }
            if (item.delta?.thinking) {
              accumulatedThinking += item.delta.thinking;
            }

            // Filter empty chunks
            if (!hasValuableContent(item, sourceFormat)) {
              continue; // Skip this empty chunk
            }

            // Inject estimated usage if finish chunk has no valid usage
            const isFinishChunk = item.type === "message_delta" || item.choices?.[0]?.finish_reason;
            if (state.finishReason && isFinishChunk && !hasValidUsage(item.usage) && totalContentLength > 0) {
              const estimated = estimateUsage(body, totalContentLength, sourceFormat);
              item.usage = filterUsageForFormat(estimated, sourceFormat); // Filter + already has buffer
              state.usage = estimated;
            } else if (state.finishReason && isFinishChunk && state.usage) {
              // Add buffer and filter usage for client (but keep original in state.usage for logging)
              const buffered = addBufferToUsage(state.usage);
              item.usage = filterUsageForFormat(buffered, sourceFormat);
            }

            const output = formatSSE(item, sourceFormat);
            reqLogger?.appendConvertedChunk?.(output);
            enqueueOutput(controller, output, streamMetrics, item);
            sseEmittedCount++;
          }
        }
      }
    },

    flush(controller) {
      const evtSummary = Object.entries(eventTypeCounts).map(([k, v]) => `${k}=${v}`).join(",") || "none";
      dbg("SSE", `flush | provider=${provider} | model=${model} | recvLines=${sseLineCount} | emitted=${sseEmittedCount} | events=[${evtSummary}]`);
      trackPendingRequest(model, provider, connectionId, false);
      if (streamMetrics) {
        streamMetrics.upstreamEnded = true;
        streamMetrics.usage = state?.usage || usage;
      }
      try {
        const remaining = decoder.decode();
        if (remaining) buffer += remaining;

        if (mode === STREAM_MODE.PASSTHROUGH) {
          if (buffer) {
            let output = buffer;
            if (buffer.startsWith("data:") && !buffer.startsWith("data: ")) {
              output = "data: " + buffer.slice(5);
            }
            reqLogger?.appendConvertedChunk?.(output);
            enqueueOutput(controller, output, streamMetrics);
          }

          if (!hasValidUsage(usage) && totalContentLength > 0) {
            usage = estimateUsage(body, totalContentLength, FORMATS.OPENAI);
          }

          if (hasValidUsage(usage)) {
            logUsage(provider, usage, model, connectionId, apiKey);
          } else {
            appendRequestLog({ model, provider, connectionId, tokens: null, status: "200 OK" }).catch(() => { });
          }
          
          // IMPORTANT: In passthrough mode we still must terminate the SSE stream.
          // Some clients (e.g. OpenClaw) expect the OpenAI-style sentinel:
          //   data: [DONE]\n\n
          // Without it they can hang until timeout and trigger failover.
          // Gemini-family clients (Antigravity, Vertex, Gemini) reject this sentinel with 400 syntax errors.
          const isGeminiFamily = provider === "antigravity" || provider === "gemini" || provider === "vertex";
          if (!streamDoneSent && !isGeminiFamily) {
            const doneOutput = "data: [DONE]\n\n";
            reqLogger?.appendConvertedChunk?.(doneOutput);
            enqueueOutput(controller, doneOutput, streamMetrics);
          }

          if (onStreamComplete) {
            onStreamComplete({
              content: accumulatedContent,
              thinking: accumulatedThinking
            }, usage, ttftAt);
          }
          return;
        }

        if (buffer.trim()) {
          const parsed = parseSSELine(buffer.trim());
          if (parsed && !parsed.done) {
            const translated = translateResponse(targetFormat, sourceFormat, parsed, state);

            if (translated?._openaiIntermediate) {
              for (const item of translated._openaiIntermediate) {
                const openaiOutput = formatSSE(item, FORMATS.OPENAI);
                reqLogger?.appendOpenAIChunk?.(openaiOutput);
              }
            }

            if (translated?.length > 0) {
              for (const item of translated) {
                if (item === null || item === undefined) continue;
                const output = formatSSE(item, sourceFormat);
                reqLogger?.appendConvertedChunk?.(output);
                enqueueOutput(controller, output, streamMetrics, item);
              }
            }
          }
        }

        const flushed = translateResponse(targetFormat, sourceFormat, null, state);

        if (flushed?._openaiIntermediate) {
          for (const item of flushed._openaiIntermediate) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }
        }

        if (flushed?.length > 0) {
          for (const item of flushed) {
            if (item === null || item === undefined) continue;
            const output = formatSSE(item, sourceFormat);
            reqLogger?.appendConvertedChunk?.(output);
            enqueueOutput(controller, output, streamMetrics, item);
          }
        }

        // Synthesize response.failed if a Responses passthrough stream never reached a terminal event
        const keepsOpenAIResponsesFormat = targetFormat === FORMATS.OPENAI_RESPONSES && sourceFormat === FORMATS.OPENAI_RESPONSES;
        if (keepsOpenAIResponsesFormat && !openAIResponsesTerminalSeen) {
          const failedOutput = formatIncompleteOpenAIResponsesStreamFailure();
          reqLogger?.appendConvertedChunk?.(failedOutput);
          enqueueOutput(controller, failedOutput, streamMetrics);
          openAIResponsesTerminalSeen = true;
        }

        if (keepsOpenAIResponsesFormat && !openAIResponsesDoneSent && !streamDoneSent) {
          const doneOutput = "data: [DONE]\n\n";
          reqLogger?.appendConvertedChunk?.(doneOutput);
          enqueueOutput(controller, doneOutput, streamMetrics);
          openAIResponsesDoneSent = true;
          streamDoneSent = true;
        }

        if (!hasValidUsage(state?.usage) && totalContentLength > 0) {
          state.usage = estimateUsage(body, totalContentLength, sourceFormat);
        }
        if (streamMetrics) streamMetrics.usage = state?.usage || usage;

        if (hasValidUsage(state?.usage)) {
          logUsage(state.provider || targetFormat, state.usage, model, connectionId, apiKey);
        } else {
          appendRequestLog({ model, provider, connectionId, tokens: null, status: "200 OK" }).catch(() => { });
        }
        
        if (onStreamComplete) {
          onStreamComplete({
            content: accumulatedContent,
            thinking: accumulatedThinking
          }, state?.usage, ttftAt);
        }
      } catch (error) {
        console.log("Error in flush:", error);
        onStreamError?.(error);
      }
    }
  });
}

export function createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider = null, reqLogger = null, toolNameMap = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, customToolNames = null, streamMetrics = null, onStreamError = null) {
  return createSSEStream({
    mode: STREAM_MODE.TRANSLATE,
    targetFormat,
    sourceFormat,
    provider,
    reqLogger,
    toolNameMap,
    customToolNames,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey,
    streamMetrics,
    onStreamError
  });
}

export function createPassthroughStreamWithLogger(provider = null, reqLogger = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, streamMetrics = null, onStreamError = null) {
  return createSSEStream({
    mode: STREAM_MODE.PASSTHROUGH,
    provider,
    reqLogger,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey,
    streamMetrics,
    onStreamError
  });
}
