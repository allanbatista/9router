// Stream handler with disconnect detection - shared for all providers
import {
  STREAM_FIRST_CHUNK_TIMEOUT_MS,
  STREAM_STALL_TIMEOUT_MS,
  STREAM_TIMEOUT_ERROR_CODES,
} from "../config/runtimeConfig.js";
import { dbg, isDebugEnabled } from "./debugLog.js";

// Get HH:MM:SS timestamp
function getTimeString() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function normalizeDisconnectReason(reason) {
  if (typeof reason === "string" && reason.trim()) return reason;
  if (reason instanceof Error && reason.message) return reason.message;
  return "client_closed";
}

function bindClientAbort(signal, onAbort) {
  if (!signal) return () => {};
  if (signal.aborted) {
    onAbort();
    return () => {};
  }
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

function createStreamTimeoutError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 504;
  return error;
}

function invokeControllerCallback(callback, value, label) {
  if (!callback) return;
  try {
    callback(value);
  } catch (error) {
    console.error(`[STREAM] ${label} callback failed:`, error?.message || error);
  }
}

/**
 * Create stream controller with abort and disconnect detection
 * @param {object} options
 * @param {function} options.onDisconnect - Callback when client disconnects
 * @param {object} options.log - Logger instance
 * @param {string} options.provider - Provider name
 * @param {string} options.model - Model name
 * @param {AbortSignal} options.clientSignal - Incoming HTTP cancellation signal
 */
export function createStreamController({ onDisconnect, onError, log, provider, model, reqTag = "", clientSignal = null } = {}) {
  const abortController = new AbortController();
  const startTime = Date.now();
  const cleanupHandlers = new Set();
  let disconnected = false;
  let removeClientAbortListener = () => {};

  // Only abnormal terminations are logged; normal completion is covered by "📊 done".
  // isError uses errorLine (always shown, ignores LOG_LEVEL) so failures survive quiet levels.
  const logStream = (symbol, status, isError = false) => {
    const duration = Date.now() - startTime;
    const emit = isError ? log?.errorLine : log?.line;
    if (emit) emit(reqTag, symbol, `${status} · ${provider}/${model} · ${duration}ms`);
    else console.log(`[${getTimeString()}] ${symbol} ${provider}/${model} · ${status} · ${duration}ms`);
  };

  const cleanup = () => {
    removeClientAbortListener();
    removeClientAbortListener = () => {};
    for (const handler of cleanupHandlers) handler();
    cleanupHandlers.clear();
  };

  const abortUpstream = () => {
    if (!abortController.signal.aborted) abortController.abort();
  };

  const controller = {
    signal: abortController.signal,
    startTime,

    isConnected: () => !disconnected,

    // Call when client disconnects
    handleDisconnect: (reason = "client_closed") => {
      if (disconnected) return;
      disconnected = true;
      const normalizedReason = normalizeDisconnectReason(reason);
      cleanup();

      logStream("⚡", `DISCONNECT: ${normalizedReason}`);
      dbg("CTRL", `${provider}/${model} | disconnect=${normalizedReason} | dur=${Date.now() - startTime}ms`);

      invokeControllerCallback(onDisconnect, { reason: normalizedReason, duration: Date.now() - startTime }, "onDisconnect");
      abortUpstream();
    },

    // Call when stream completes normally (no line here — "📊 done" is authoritative)
    handleComplete: () => {
      if (disconnected) return;
      disconnected = true;
      cleanup();
    },

    // Call on error
    handleError: (error) => {
      if (disconnected) return;
      disconnected = true;
      cleanup();

      if (error.name === "AbortError") {
        logStream("⚡", "ABORTED");
        invokeControllerCallback(onError, error, "onError");
        abortUpstream();
        return;
      }

      logStream("✗", `ERROR: ${error.message}${error.stack ? `\n    ${error.stack}` : ""}`, true);
      invokeControllerCallback(onError, error, "onError");
      abortUpstream();
    },

    abort: abortUpstream,

    addCleanup(handler) {
      if (typeof handler !== "function") return () => {};
      if (disconnected) {
        handler();
        return () => {};
      }
      cleanupHandlers.add(handler);
      return () => cleanupHandlers.delete(handler);
    },
  };

  removeClientAbortListener = bindClientAbort(clientSignal, () => {
    controller.handleDisconnect(clientSignal.reason);
  });

  return controller;
}

/**
 * Create transform stream with disconnect detection
 * Wraps existing transform stream and adds abort capability.
 *
 * Stall detection lives in pipeWithDisconnect (tied to upstream byte
 * activity), not here — output of the transform stream may be silent
 * for long periods while raw bytes still flow (e.g. Kiro EventStream
 * binary frames buffering, Claude reasoning streams).
 */
export function createDisconnectAwareStream(transformStream, streamController, onAbortTerminal = null) {
  const reader = transformStream.readable.getReader();
  const writer = transformStream.writable.getWriter();
  let terminalEmitted = false;

  // Emit a synthesized terminal payload (e.g. Responses response.failed + [DONE]) once
  const emitTerminal = (controller) => {
    if (terminalEmitted || !onAbortTerminal) return;
    terminalEmitted = true;
    try {
      const bytes = onAbortTerminal();
      if (bytes) controller.enqueue(bytes);
    } catch { /* best-effort terminal */ }
  };

  return new ReadableStream({
    async pull(controller) {
      if (!streamController.isConnected()) {
        emitTerminal(controller);
        controller.close();
        return;
      }

      try {
        const { done, value } = await reader.read();

        if (done) {
          streamController.handleComplete();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        const wasConnected = streamController.isConnected();
        // Controller already closed = downstream ended; not an upstream error, skip noisy log.
        const msg0 = error?.message || "";
        const isControllerClosed = msg0.includes("already closed") || msg0.includes("Invalid state");
        if (!isControllerClosed) streamController.handleError(error);
        reader.cancel().catch(() => {});
        writer.abort().catch(() => {});

        // Treat network resets / socket hang up / abort as graceful close
        const msg = error?.message || "";
        const code = error?.code || error?.cause?.code || "";
        const isNetworkClose =
          error.name === "AbortError" ||
          msg.includes("aborted") ||
          msg.includes("socket hang up") ||
          msg.includes("ECONNRESET") ||
          msg.includes("ETIMEDOUT") ||
          msg.includes("EPIPE") ||
          code === "ECONNRESET" ||
          code === "ETIMEDOUT" ||
          code === "EPIPE" ||
          code === "UND_ERR_SOCKET";

        // Graceful close on network/abort, or when a structured terminal is available
        // (Responses passthrough prefers response.failed + [DONE] over a raw transport error)
        try {
          if (!wasConnected || isNetworkClose || onAbortTerminal) {
            emitTerminal(controller);
            controller.close();
          } else {
            controller.error(error);
          }
        } catch (e) { /* already closed or cancelled */ }
      }
    },

    cancel(reason) {
      streamController.handleDisconnect(reason || "cancelled");
      reader.cancel();
      writer.abort();
    }
  });
}

/**
 * Pipe provider response through transform with disconnect detection.
 *
 * Stall watchdog tracks raw upstream byte activity, not transform output.
 * Reasoning models (Claude thinking via Kiro, etc.) can produce zero SSE
 * output for long stretches while partial EventStream frames keep arriving.
 * Measuring stall on the transform output caused false stalls and the
 * "failed to pipe response" error in Next.
 *
 * The first chunk and subsequent inactivity use independent deadlines. Any
 * upstream chunk switches to and resets the inter-chunk stall deadline.
 *
 * @param {Response} providerResponse - Response from provider
 * @param {TransformStream} transformStream - Transform stream for SSE
 * @param {object} streamController - Stream controller from createStreamController
 */
export function pipeWithDisconnect(providerResponse, transformStream, streamController, onAbortTerminal = null, stallTimeoutMs = STREAM_STALL_TIMEOUT_MS, streamMetrics = null, firstChunkTimeoutMs = STREAM_FIRST_CHUNK_TIMEOUT_MS) {
  let stallTimer = null;
  let chunkCount = 0;
  let totalBytes = 0;
  let lastChunkAt = Date.now();
  const t0 = Date.now();
  const tag = "STREAM";
  const clearStall = () => {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  };
  const armStall = () => {
    clearStall();
    const awaitingFirstChunk = chunkCount === 0;
    const timeoutMs = awaitingFirstChunk ? firstChunkTimeoutMs : stallTimeoutMs;
    const timeoutCode = awaitingFirstChunk
      ? STREAM_TIMEOUT_ERROR_CODES.FIRST_CHUNK
      : STREAM_TIMEOUT_ERROR_CODES.STALL;
    const timeoutMessage = awaitingFirstChunk
      ? "stream first chunk timeout"
      : "stream stall timeout";
    stallTimer = setTimeout(() => {
      stallTimer = null;
      dbg(tag, `${timeoutCode} ${timeoutMs}ms | chunks=${chunkCount} | bytes=${totalBytes} | sinceLast=${Date.now() - lastChunkAt}ms`);
      streamController.handleError?.(createStreamTimeoutError(timeoutCode, timeoutMessage));
      streamController.abort?.();
    }, timeoutMs);
  };

  streamController.addCleanup?.(clearStall);

  // Wrap controller so every termination path clears the stall timer.
  // Without this, abort/cancel/downstream-error paths leave the timer armed
  // and a stale abort could fire after the request has already ended.
  const wrappedController = {
    signal: streamController.signal,
    startTime: streamController.startTime,
    isConnected: () => streamController.isConnected(),
    handleComplete: () => { dbg(tag, `complete | chunks=${chunkCount} | bytes=${totalBytes} | dur=${Date.now() - t0}ms`); clearStall(); streamController.handleComplete(); },
    handleError: (e) => { dbg(tag, `error: ${e?.message} | chunks=${chunkCount} | bytes=${totalBytes} | dur=${Date.now() - t0}ms`); clearStall(); streamController.handleError(e); },
    handleDisconnect: (r) => { dbg(tag, `disconnect: ${r} | chunks=${chunkCount} | bytes=${totalBytes} | dur=${Date.now() - t0}ms`); clearStall(); streamController.handleDisconnect(r); },
    abort: () => { clearStall(); streamController.abort(); }
  };

  armStall();
  dbg(tag, `pipe start | firstChunkTimeout=${firstChunkTimeoutMs}ms | stallTimeout=${stallTimeoutMs}ms`);

  const upstreamTap = new TransformStream({
    transform(chunk, controller) {
      chunkCount++;
      const sz = chunk?.byteLength || chunk?.length || 0;
      totalBytes += sz;
      if (streamMetrics) {
        streamMetrics.providerChunks++;
        streamMetrics.providerBytes += sz;
      }
      const now = Date.now();
      const gap = now - lastChunkAt;
      lastChunkAt = now;
      if (isDebugEnabled && (chunkCount <= 5 || chunkCount % 20 === 0 || gap > 5000)) {
        dbg(tag, `chunk #${chunkCount} | size=${sz}B | gap=${gap}ms | total=${totalBytes}B`);
      }
      armStall();
      controller.enqueue(chunk);
    },
    flush() {
      dbg(tag, `upstream EOF | chunks=${chunkCount} | bytes=${totalBytes} | dur=${Date.now() - t0}ms`);
      if (streamMetrics) streamMetrics.upstreamEnded = true;
      clearStall();
    }
  });

  const transformedBody = providerResponse.body
    .pipeThrough(upstreamTap)
    .pipeThrough(transformStream);

  return createDisconnectAwareStream(
    { readable: transformedBody, writable: { getWriter: () => ({ abort: () => Promise.resolve() }) } },
    wrappedController,
    onAbortTerminal
  );
}
