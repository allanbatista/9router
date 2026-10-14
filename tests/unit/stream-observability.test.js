import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendRequestLog: vi.fn(() => Promise.resolve()),
  saveRequestDetail: vi.fn(() => Promise.resolve()),
  saveRequestUsage: vi.fn(() => Promise.resolve()),
  trackPendingRequest: vi.fn(),
}));

vi.mock("@/lib/usageDb.js", () => mocks);

import "../translator/registerAll.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import {
  ANTIGRAVITY_FETCH_CONNECT_TIMEOUT_MS,
  ANTIGRAVITY_STREAM_FIRST_CHUNK_TIMEOUT_MS,
  ANTIGRAVITY_STREAM_STALL_TIMEOUT_MS,
  STREAM_TIMEOUT_ERROR_CODES,
} from "../../open-sse/config/runtimeConfig.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { createSSETransformStreamWithLogger, createStreamMetrics } from "../../open-sse/utils/stream.js";
import { createStreamController, pipeWithDisconnect } from "../../open-sse/utils/streamHandler.js";
import { buildOnStreamComplete } from "../../open-sse/handlers/chatCore/streamingHandler.js";

async function readText(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return output + decoder.decode();
    output += decoder.decode(value, { stream: true });
  }
}

describe("stream observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses dedicated Antigravity deadlines and a bounded connect retry", () => {
    expect(PROVIDERS.antigravity).toMatchObject({
      timeoutMs: ANTIGRAVITY_FETCH_CONNECT_TIMEOUT_MS,
      firstChunkTimeoutMs: ANTIGRAVITY_STREAM_FIRST_CHUNK_TIMEOUT_MS,
      stallTimeoutMs: ANTIGRAVITY_STREAM_STALL_TIMEOUT_MS,
      retry: {
        502: { attempts: 1, delayMs: 2000 },
      },
    });
  });

  it("persists client cancellation with partial tool-call metrics once", () => {
    const requestStartTime = Date.now() - 100;
    const streamMetrics = createStreamMetrics();
    streamMetrics.providerChunks = 2;
    streamMetrics.providerBytes = 128;
    streamMetrics.clientChunks = 2;
    streamMetrics.clientBytes = 96;
    streamMetrics.toolCalls.push({ id: "call-1", name: "grep", index: 0 });
    streamMetrics.ttftAt = requestStartTime + 20;
    streamMetrics.usage = { prompt_tokens: 10, completion_tokens: 2 };

    const callbacks = buildOnStreamComplete({
      provider: "antigravity",
      model: "gemini-3.7-flash-high",
      connectionId: "connection-1",
      requestStartTime,
      body: { model: "batista-high", stream: true, messages: [] },
      stream: true,
      finalBody: { request: {} },
      translatedBody: { request: {} },
      clientRawRequest: { body: { model: "batista-high", stream: true, messages: [] } },
      streamMetrics,
    });

    callbacks.onStreamDisconnect({ reason: "ResponseAborted" });
    callbacks.onStreamComplete({ content: "late" }, { prompt_tokens: 99, completion_tokens: 99 }, requestStartTime + 30);

    expect(mocks.saveRequestDetail).toHaveBeenCalledTimes(1);
    const detail = mocks.saveRequestDetail.mock.calls[0][0];
    expect(detail.status).toBe("success");
    expect(detail.response).toMatchObject({
      content: "[Tool-call response]",
      termination: "client_closed",
      reason: "ResponseAborted",
      metrics: {
        clientBytes: 96,
        toolCalls: [{ id: "call-1", name: "grep", index: 0 }],
      },
    });
    expect(detail.providerResponse.partial).toBe(true);
  });

  it("persists normal completion as success", () => {
    const requestStartTime = Date.now() - 100;
    const callbacks = buildOnStreamComplete({
      provider: "antigravity",
      model: "gemini-3.7-flash-high",
      connectionId: "connection-1",
      requestStartTime,
      body: { model: "batista-high", stream: true, messages: [] },
      stream: true,
      clientRawRequest: { body: { model: "batista-high", stream: true, messages: [] } },
      streamMetrics: createStreamMetrics(),
    });

    callbacks.onStreamComplete({ content: "answer" }, { prompt_tokens: 10, completion_tokens: 2 }, requestStartTime + 20);

    expect(mocks.saveRequestDetail).toHaveBeenCalledTimes(1);
    expect(mocks.saveRequestDetail.mock.calls[0][0]).toMatchObject({
      status: "success",
      response: { content: "answer", termination: "completed" },
    });
  });

  it("marks an account successful only after normal stream completion", async () => {
    const onRequestSuccess = vi.fn();
    const callbacks = buildOnStreamComplete({
      provider: "antigravity",
      model: "gemini-3.8-flash-high",
      connectionId: "connection-1",
      requestStartTime: Date.now() - 100,
      body: { model: "batista-simple", stream: true, messages: [] },
      stream: true,
      clientRawRequest: { body: { model: "batista-simple", stream: true, messages: [] } },
      streamMetrics: createStreamMetrics(),
      onRequestSuccess,
    });

    expect(onRequestSuccess).not.toHaveBeenCalled();
    callbacks.onStreamComplete({ content: "answer" }, { prompt_tokens: 10, completion_tokens: 2 });
    await vi.waitFor(() => expect(onRequestSuccess).toHaveBeenCalledOnce());
  });

  it("persists stream errors and reports the provider failure", async () => {
    const onStreamFailure = vi.fn();
    const callbacks = buildOnStreamComplete({
      provider: "antigravity",
      model: "gemini-3.7-flash-high",
      connectionId: "connection-1",
      requestStartTime: Date.now() - 100,
      body: { model: "batista-high", stream: true, messages: [] },
      stream: true,
      clientRawRequest: { body: { model: "batista-high", stream: true, messages: [] } },
      streamMetrics: createStreamMetrics(),
      onStreamFailure,
    });

    const error = new Error("upstream stream failed");
    callbacks.onStreamError(error);

    expect(mocks.saveRequestDetail).toHaveBeenCalledTimes(1);
    expect(mocks.saveRequestDetail.mock.calls[0][0]).toMatchObject({
      status: "error",
      error: "upstream stream failed",
      response: { termination: "error", error: "upstream stream failed" },
    });
    await vi.waitFor(() => expect(onStreamFailure).toHaveBeenCalledWith(error));
  });

  it("propagates the incoming client abort to the upstream signal", () => {
    const clientAbort = new AbortController();
    const onDisconnect = vi.fn();
    const controller = createStreamController({
      provider: "antigravity",
      model: "gemini-3.8-flash-high",
      log: { line: vi.fn(), errorLine: vi.fn() },
      clientSignal: clientAbort.signal,
      onDisconnect,
    });

    clientAbort.abort(new Error("client connection closed"));

    expect(controller.signal.aborted).toBe(true);
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith(expect.objectContaining({
      reason: "client connection closed",
    }));
  });

  it("uses separate first-chunk and inter-chunk deadlines", async () => {
    vi.useFakeTimers();
    try {
      const firstChunkError = vi.fn();
      const firstChunkController = createStreamController({
        provider: "antigravity",
        model: "gemini-3.8-flash-high",
        log: { line: vi.fn(), errorLine: vi.fn() },
        onError: firstChunkError,
      });
      pipeWithDisconnect(
        new Response(new ReadableStream({ start() {} })),
        new TransformStream(),
        firstChunkController,
        null,
        90,
        null,
        60,
      );

      await vi.advanceTimersByTimeAsync(60);
      expect(firstChunkError).toHaveBeenCalledWith(expect.objectContaining({
        code: STREAM_TIMEOUT_ERROR_CODES.FIRST_CHUNK,
      }));

      const stallError = vi.fn();
      const stallController = createStreamController({
        provider: "antigravity",
        model: "gemini-3.8-flash-high",
        log: { line: vi.fn(), errorLine: vi.fn() },
        onError: stallError,
      });
      const output = pipeWithDisconnect(
        new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: partial\n\n"));
          },
        })),
        new TransformStream(),
        stallController,
        null,
        90,
        null,
        60,
      );
      await output.getReader().read();

      await vi.advanceTimersByTimeAsync(89);
      expect(stallError).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(stallError).toHaveBeenCalledWith(expect.objectContaining({
        code: STREAM_TIMEOUT_ERROR_CODES.STALL,
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("records translated tool-calls and client bytes", async () => {
    const metrics = createStreamMetrics();
    const input = `data: ${JSON.stringify({
      response: {
        responseId: "response-1",
        modelVersion: "gemini-3.7-flash-high",
        candidates: [{
          content: {
            role: "model",
            parts: [{ functionCall: { id: "call-1", name: "grep", args: { path: "." } } }],
          },
        }],
      },
    })}\n\n`;
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(input));
        controller.close();
      },
    });
    const transformed = pipeWithDisconnect(new Response(source), createSSETransformStreamWithLogger(
      FORMATS.ANTIGRAVITY,
      FORMATS.OPENAI,
      "antigravity",
      null,
      null,
      "gemini-3.7-flash-high",
      null,
      null,
      null,
      null,
      null,
      metrics,
    ), createStreamController({
      provider: "antigravity",
      model: "gemini-3.7-flash-high",
      log: { line: vi.fn(), errorLine: vi.fn() },
    }), null, 1000, metrics);

    const output = await readText(transformed);

    expect(output).toContain('"tool_calls"');
    expect(metrics.providerChunks).toBe(1);
    expect(metrics.providerBytes).toBe(new TextEncoder().encode(input).byteLength);
    expect(metrics.clientBytes).toBeGreaterThan(0);
    expect(metrics.clientChunks).toBeGreaterThan(0);
    expect(metrics.upstreamEnded).toBe(true);
    expect(metrics.toolCalls).toHaveLength(1);
    expect(metrics.toolCalls[0]).toMatchObject({ name: "grep", index: 0 });
    expect(metrics.toolCalls[0].id).toMatch(/^grep-\d+-0$/);
  });
});
