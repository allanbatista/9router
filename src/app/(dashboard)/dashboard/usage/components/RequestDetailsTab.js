"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Badge from "@/shared/components/Badge";
import Drawer from "@/shared/components/Drawer";
import Pagination from "@/shared/components/Pagination";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { cn } from "@/shared/utils/cn";
import { getCachedTokens, getCacheCreationTokens, getPromptTokens } from "@/shared/utils/usageTokens";
import { classifyRequest, getRequestSessionIdentity } from "@/shared/utils/requestClassification.js";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";
let providerNodesCache = null;
let providerNameCache = null;
let connectionNameCache = null;

const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
});

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data inválida" : timestampFormatter.format(date);
}

async function fetchConnectionNames() {
  if (connectionNameCache) return connectionNameCache;
  try {
    const res = await fetch("/api/providers");
    const data = await res.json();
    const map = {};
    for (const c of data.connections || []) {
      const email = c.email
        || c.providerSpecificData?.email
        || c.providerSpecificData?.userInfo?.email
        || c.providerSpecificData?.accountEmail;
      map[c.id] = email || c.displayName || c.name || `${c.id.slice(0, 8)}…`;
    }
    connectionNameCache = map;
    return map;
  } catch {
    return {};
  }
}

function getConnectionName(connectionId, cache) {
  if (!connectionId) return "—";
  if (cache && cache[connectionId]) return cache[connectionId];
  return `${connectionId.slice(0, 8)}…`;
}

async function fetchProviderNames() {
  if (providerNameCache && providerNodesCache) {
    return { providerNameCache, providerNodesCache };
  }

  const nodesRes = await fetch("/api/provider-nodes");
  const nodesData = await nodesRes.json();
  const nodes = nodesData.nodes || [];
  providerNodesCache = {};

  for (const node of nodes) {
    providerNodesCache[node.id] = node.name;
  }

  providerNameCache = {
    ...AI_PROVIDERS,
    ...providerNodesCache
  };

  return { providerNameCache, providerNodesCache };
}

function getProviderName(providerId, cache) {
  if (!providerId) return providerId;
  if (!cache) return providerId;

  const cached = cache[providerId];

  if (typeof cached === 'string') {
    return cached;
  }

  if (cached?.name) {
    return cached.name;
  }

  const providerConfig = getProviderByAlias(providerId) || AI_PROVIDERS[providerId];
  return providerConfig?.name || providerId;
}

function CollapsibleSection({ title, children, defaultOpen = false, icon = null, copyValue = null, copyId = null, copied = null, onCopy = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-black/5 dark:border-white/5 rounded-lg overflow-hidden">
      <div className="flex items-center bg-black/[0.02] dark:bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex min-w-0 flex-1 items-center justify-between p-3 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
        >
          <span className="flex min-w-0 items-center gap-2">
            {icon && <span className="material-symbols-outlined text-[18px] text-text-muted">{icon}</span>}
            <span className="truncate font-semibold text-sm text-text-main">{title}</span>
          </span>
          <span className={cn(
            "material-symbols-outlined text-[20px] text-text-muted transition-transform duration-200",
            isOpen ? "rotate-90" : ""
          )}>
            chevron_right
          </span>
        </button>
        {copyValue !== null && onCopy && (
          <Button
            variant="ghost"
            size="sm"
            icon={copied === copyId ? "check" : "content_copy"}
            aria-label={`Copy ${title}`}
            title={`Copy ${title}`}
            className="mr-2 h-8 w-8 px-0"
            onClick={() => onCopy(copyValue, copyId)}
          />
        )}
      </div>
      
      {isOpen && (
        <div className="p-4 border-t border-black/5 dark:border-white/5">
          {children}
        </div>
      )}
    </div>
  );
}

function getInputTokens(tokens) {
  return getPromptTokens(tokens);
}

function formatJsonPayload(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? null, null, 2);
}

function getCacheKey(detail) {
  return getRequestSessionIdentity(detail).cacheKey;
}
function getRawSessionId(detail) {
  return getRequestSessionIdentity(detail).rawSessionId;
}
function getSessionId(detail) {
  return getRequestSessionIdentity(detail).sessionId;
}
function getConversationId(detail) {
  return getRequestSessionIdentity(detail).conversationId;
}

function CopyIconButton({ value, copyId, copied, onCopy, label }) {
  const text = value == null ? "" : String(value);
  if (!text || text === "—") return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={copied === copyId ? "check" : "content_copy"}
      aria-label={label}
      title={label}
      className="h-7 w-7 px-0"
      onClick={() => onCopy(text, copyId)}
    />
  );
}

function getStreamMetrics(detail) {
  return detail?.response?.metrics || detail?.providerResponse?.metrics || {};
}

function getToolCalls(detail) {
  const toolCalls = getStreamMetrics(detail).toolCalls;
  return Array.isArray(toolCalls) ? toolCalls : [];
}

function isClientClosedAfterToolCall(detail) {
  const termination = detail?.response?.termination || detail?.providerResponse?.termination;
  return termination === "client_closed" && getToolCalls(detail).length > 0;
}

function getDisplayStatus(detail) {
  return isClientClosedAfterToolCall(detail) ? "success" : (detail?.status || "unknown");
}

function getLifecycleSummary(detail) {
  const response = detail?.response || {};
  const providerResponse = detail?.providerResponse || {};
  const metrics = getStreamMetrics(detail);
  const termination = response.termination || providerResponse.termination || "—";
  const reason = response.reason || providerResponse.reason || "—";
  const providerBytes = Number(metrics.providerBytes) || 0;
  const clientBytes = Number(metrics.clientBytes) || 0;
  const toolCalls = getToolCalls(detail);

  if (termination === "client_closed") {
    return {
      badgeVariant: "warning",
      source: "client",
      label: toolCalls.length > 0 ? "Client closed after partial tool-call" : "Client closed stream",
      explanation: providerBytes > 0 && clientBytes > 0
        ? "The provider sent data and 9Router forwarded it to the consumer; the stream ended before the provider reached EOF."
        : "The consumer closed the stream before a complete response was observed; no provider HTTP error was recorded.",
      termination,
      reason,
      metrics,
    };
  }

  if (termination === "completed") {
    return {
      badgeVariant: "success",
      source: "provider",
      label: "Completed normally",
      explanation: "The provider stream reached its normal terminal event.",
      termination,
      reason,
      metrics,
    };
  }

  if (getDisplayStatus(detail) === "error" || response.error || detail?.error) {
    return {
      badgeVariant: "error",
      source: "provider/transport",
      label: "Provider/transport error",
      explanation: "9Router persisted an error during the provider request or stream transport.",
      termination,
      reason,
      metrics,
    };
  }

  return {
    badgeVariant: "default",
    source: "unknown",
    label: "Lifecycle not recorded",
    explanation: "This record does not contain enough lifecycle metadata to classify the termination.",
    termination,
    reason,
    metrics,
  };
}

function formatConversationForCopy(messages) {
  return messages
    .map(({ role, text, thinking }) => `[${role}]${thinking ? `\n[thinking]\n${thinking}` : ""}\n${text}`)
    .join("\n\n");
}

export default function RequestDetailsTab() {
  const { copied, copy } = useCopyToClipboard();
  const [details, setDetails] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0
  });
  const [loading, setLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState("metadata"); // "metadata" | "preview" | "raw"
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [providers, setProviders] = useState([]);
  const [providerNameCache, setProviderNameCache] = useState(null);
  const [connectionCache, setConnectionCache] = useState(null);
  const [metadataKeys, setMetadataKeys] = useState(["os", "hostname", "agent-name"]);
  const [metadataValues, setMetadataValues] = useState({});
  const [statusPreset, setStatusPreset] = useState("all"); // "all" | "errors" | "streaming" | "success"
  const [filters, setFilters] = useState({
    provider: "",
    status: "",
    sessionId: "",
    startDate: "",
    endDate: "",
    metadata: {},
  });

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/usage/providers");
      const data = await res.json();
      setProviders(data.providers || []);

      const pCache = await fetchProviderNames();
      setProviderNameCache(pCache.providerNameCache);
      const cCache = await fetchConnectionNames();
      setConnectionCache(cCache);
      const settingsRes = await fetch("/api/settings");
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (Array.isArray(sData.agentMetadataKeys)) {
          setMetadataKeys(sData.agentMetadataKeys);
          sData.agentMetadataKeys.forEach(async (k) => {
            try {
              const valRes = await fetch(`/api/usage/metadata-values?key=${encodeURIComponent(k)}`);
              if (valRes.ok) {
                const valData = await valRes.json();
                setMetadataValues((prev) => ({ ...prev, [k]: valData.values || [] }));
              }
            } catch {}
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch providers or settings:", error);
    }
  }, []);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString()
      });
      if (filters.provider) params.append("provider", filters.provider);
      if (filters.status) params.append("status", filters.status);
      if (filters.sessionId) params.append("sessionId", filters.sessionId);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);
      if (filters.metadata) {
        for (const [k, v] of Object.entries(filters.metadata)) {
          if (v) params.append(`agentMetadata[${k}]`, v);
        }
      }

      const res = await fetch(`/api/usage/request-details?${params}`);
      const data = await res.json();

      setDetails(data.details || []);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch (error) {
      console.error("Failed to fetch request details:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, filters]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleViewDetail = async (detail) => {
    setSelectedDetail(detail);
    setActiveDrawerTab("metadata");
    setIsDrawerOpen(true);
    try {
      const res = await fetch(`/api/usage/request-details/${encodeURIComponent(detail.id)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.detail) {
        setSelectedDetail((prev) => ({
          ...data.detail,
          cacheKey: data.detail.cacheKey ?? prev?.cacheKey,
          rawSessionId: data.detail.rawSessionId ?? prev?.rawSessionId,
          sessionId: data.detail.sessionId ?? prev?.sessionId,
          conversationId: data.detail.conversationId ?? prev?.conversationId
        }));
      }
    } catch {}
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newPageSize) => {
    setPagination(prev => ({ ...prev, pageSize: newPageSize, page: 1 }));
  };

  const handleClearFilters = () => {
    setStatusPreset("all");
    setFilters({ provider: "", status: "", sessionId: "", startDate: "", endDate: "", metadata: {} });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePresetChange = (preset) => {
    setStatusPreset(preset);
    setFilters(prev => ({
      ...prev,
      status: preset === "errors" ? "error" : preset === "streaming" ? "streaming" : preset === "success" ? "success" : ""
    }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleProviderChange = (provider) => {
    setFilters(prev => ({ ...prev, provider }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleDateChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSessionFilter = (sessionId) => {
    const value = String(sessionId || "").trim();
    if (!value) return;
    setFilters((prev) => ({ ...prev, sessionId: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
    setIsDrawerOpen(false);
    setShowAdvancedFilters(true);
  };

  const handleSessionFilterChange = (value) => {
    setFilters((prev) => ({ ...prev, sessionId: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleMetadataFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        [key]: value,
      },
    }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const removeFilterBadge = (type, key = null) => {
    if (type === "provider") setFilters(prev => ({ ...prev, provider: "" }));
    if (type === "status") { setStatusPreset("all"); setFilters(prev => ({ ...prev, status: "" })); }
    if (type === "session") setFilters(prev => ({ ...prev, sessionId: "" }));
    if (type === "startDate") setFilters(prev => ({ ...prev, startDate: "" }));
    if (type === "endDate") setFilters(prev => ({ ...prev, endDate: "" }));
    if (type === "metadata" && key) {
      setFilters(prev => {
        const nextMeta = { ...prev.metadata };
        delete nextMeta[key];
        return { ...prev, metadata: nextMeta };
      });
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const activeFiltersCount = (filters.provider ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.sessionId ? 1 : 0) +
    (filters.startDate ? 1 : 0) +
    (filters.endDate ? 1 : 0) +
    Object.values(filters.metadata || {}).filter(Boolean).length;

  // Extract conversation messages for preview
  const formatToolCall = (tc) => {
    if (!tc) return "";
    const name = tc.function?.name || tc.name || "tool";
    let args = tc.function?.arguments ?? tc.args ?? tc.input;
    if (typeof args === "object" && args !== null) {
      try { args = JSON.stringify(args); } catch { args = String(args); }
    }
    return `[Tool Call: ${name}(${args || ""})]`;
  };

  const extractMessages = (detail) => {
    if (!detail) return [];
    const rq = detail.request || {};
    const pr = detail.providerRequest || {};
    const rawMsgs = rq.messages || rq.contents || pr.messages || pr.contents || [];
    const out = [];
    if (Array.isArray(rawMsgs)) {
      for (const m of rawMsgs) {
        let role = m.role || (m.parts ? "user" : "user");
        if (role === "model") role = "assistant";
        const textParts = [];
        let thinking = m.reasoning_content || m.reasoning || m.thinking || null;

        if (typeof m.content === "string") {
          if (m.content) textParts.push(m.content);
        } else if (Array.isArray(m.content)) {
          for (const c of m.content) {
            if (typeof c === "string") {
              if (c) textParts.push(c);
            } else if (c && typeof c === "object") {
              if (c.type === "text" && c.text) {
                textParts.push(c.text);
              } else if (c.type === "thinking" && c.thinking) {
                thinking = (thinking ? thinking + "\n" : "") + c.thinking;
              } else if (c.type === "tool_use") {
                textParts.push(formatToolCall({ name: c.name, input: c.input }));
              } else if (c.type === "tool_result") {
                const resText = typeof c.content === "string" ? c.content : JSON.stringify(c.content ?? "");
                textParts.push(`[Tool Result${c.tool_use_id ? ` (${c.tool_use_id})` : ""}]: ${resText}`);
              } else if (c.type === "image_url" || c.type === "image") {
                textParts.push("[Image]");
              } else if (c.text) {
                textParts.push(c.text);
              } else {
                try { textParts.push(JSON.stringify(c)); } catch {}
              }
            }
          }
        } else if (Array.isArray(m.parts)) {
          for (const p of m.parts) {
            if (typeof p === "string") {
              if (p) textParts.push(p);
            } else if (p && typeof p === "object") {
              if (p.thought === true || p.thought) {
                thinking = (thinking ? thinking + "\n" : "") + (p.text || "");
              } else if (p.text) {
                textParts.push(p.text);
              } else if (p.functionCall) {
                textParts.push(formatToolCall({ name: p.functionCall.name, args: p.functionCall.args }));
              } else if (p.functionResponse) {
                const resText = typeof p.functionResponse.response === "string" ? p.functionResponse.response : JSON.stringify(p.functionResponse.response ?? "");
                textParts.push(`[Tool Result (${p.functionResponse.name || "tool"})]: ${resText}`);
              } else if (p.fileData || p.inlineData) {
                textParts.push(`[Media: ${(p.fileData || p.inlineData).mimeType || "file"}]`);
              }
            }
          }
        } else if (m.text) {
          textParts.push(m.text);
        }

        if (Array.isArray(m.tool_calls)) {
          for (const tc of m.tool_calls) {
            textParts.push(formatToolCall(tc));
          }
        }

        const text = textParts.join("\n\n").trim();
        out.push({
          role,
          text: text || (thinking ? "" : "[Empty message]"),
          ...(thinking ? { thinking } : {})
        });
      }
    }
    // Append assistant final response
    const resp = detail.response || {};
    let finalThinking = resp.thinking || null;
    let finalText = "";
    if (resp.content && resp.content !== "[No content]" && resp.content !== "[Streaming in progress...]" && resp.content !== "[Tool-call response]" && resp.content !== "[No response bytes observed]" && resp.content !== "[Empty streaming response]") {
      finalText = resp.content;
    }

    const toolCalls = resp.metrics?.toolCalls || detail.providerResponse?.metrics?.toolCalls || [];
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const tcText = toolCalls.map(tc => `[Tool Call: ${tc.name || "tool"}${tc.id ? ` id=${tc.id}` : ""}]`).join("\n");
      finalText = finalText ? `${finalText}\n\n${tcText}` : tcText;
    } else if (resp.content === "[Tool-call response]") {
      finalText = "[Tool Call response]";
    }

    if (finalText || finalThinking) {
      out.push({ role: "assistant", text: finalText || "", thinking: finalThinking });
    } else if (resp.error) {
      out.push({ role: "assistant", text: `[Error: ${resp.error}]`, isError: true });
    }
    return out;
  };

  const selectedMessages = extractMessages(selectedDetail);
  const lifecycle = getLifecycleSummary(selectedDetail);
  const selectedDisplayStatus = getDisplayStatus(selectedDetail);
  const drawerTabs = [
    { id: "metadata", label: "Agent & Config", icon: "tune" },
    { id: "preview", label: "Conversation Preview", icon: "forum" },
    { id: "raw", label: "Raw Payloads", icon: "data_object" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Modern Compact Filter Bar */}
      <Card padding="md" className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Quick Presets */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5">
            <button
              type="button"
              onClick={() => handlePresetChange("all")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                statusPreset === "all"
                  ? "bg-surface text-text-main shadow-sm"
                  : "text-text-muted hover:text-text-main"
              )}
            >
              All Requests
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange("errors")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5",
                statusPreset === "errors"
                  ? "bg-red-500/15 text-red-600 dark:text-red-400 shadow-sm"
                  : "text-text-muted hover:text-red-600 dark:hover:text-red-400"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Errors Only
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange("streaming")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5",
                statusPreset === "streaming"
                  ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 shadow-sm"
                  : "text-text-muted hover:text-sky-600 dark:hover:text-sky-400"
              )}
            >
              <span className="material-symbols-outlined text-[14px]">stream</span>
              Streaming
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant={showAdvancedFilters ? "secondary" : "outline"}
              size="sm"
              icon="tune"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="text-xs"
            >
              {showAdvancedFilters ? "Hide Filters" : "Filters"}
              {activeFiltersCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-bold text-[10px]">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDetails()}
              disabled={loading}
              icon={loading ? "progress_activity" : "refresh"}
              className={cn("text-xs", loading ? "animate-pulse" : "")}
            >
              Refresh
            </Button>
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-xs text-text-muted hover:text-red-500"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible Advanced Filters Tray */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-black/5 dark:border-white/5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in duration-200">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="provider-filter" className="text-xs font-semibold text-text-muted uppercase tracking-wider">Provider</label>
              <select
                id="provider-filter"
                value={filters.provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                <option value="">All Providers</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor="session-filter" className="text-xs font-semibold text-text-muted uppercase tracking-wider">Session ID</label>
              <input
                id="session-filter"
                type="text"
                value={filters.sessionId}
                onChange={(e) => handleSessionFilterChange(e.target.value)}
                placeholder="Filter all requests from one session..."
                className="h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface text-xs text-text-main font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {metadataKeys.map((metaKey) => (
              <div key={metaKey} className="flex flex-col gap-1.5">
                <label htmlFor={`meta-filter-${metaKey}`} className="text-xs font-semibold text-text-muted uppercase tracking-wider capitalize">
                  {metaKey.replace(/-/g, " ")}
                </label>
                <input
                  id={`meta-filter-${metaKey}`}
                  type="text"
                  list={`meta-datalist-${metaKey}`}
                  value={filters.metadata[metaKey] || ""}
                  onChange={(e) => handleMetadataFilterChange(metaKey, e.target.value)}
                  placeholder={`Filter ${metaKey}...`}
                  className="h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {metadataValues[metaKey] && metadataValues[metaKey].length > 0 && (
                  <datalist id={`meta-datalist-${metaKey}`}>
                    {metadataValues[metaKey].map((val) => (
                      <option key={val} value={val} />
                    ))}
                  </datalist>
                )}
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="start-date-filter" className="text-xs font-semibold text-text-muted uppercase tracking-wider">Start Date</label>
              <input
                id="start-date-filter"
                type="datetime-local"
                value={filters.startDate}
                onChange={(e) => handleDateChange("startDate", e.target.value)}
                className="h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="end-date-filter" className="text-xs font-semibold text-text-muted uppercase tracking-wider">End Date</label>
              <input
                id="end-date-filter"
                type="datetime-local"
                value={filters.endDate}
                onChange={(e) => handleDateChange("endDate", e.target.value)}
                className="h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        )}

        {/* Active Filter Chips */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-black/5 dark:border-white/5 text-xs">
            <span className="text-text-muted text-[11px] font-medium mr-1">Active filters:</span>
            {filters.provider && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                Provider: <strong>{getProviderName(filters.provider, providerNameCache)}</strong>
                <button type="button" onClick={() => removeFilterBadge("provider")} className="hover:opacity-75 ml-0.5">✕</button>
              </span>
            )}
            {filters.status && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/5 dark:bg-white/5 border border-border">
                Status: <strong>{filters.status}</strong>
                <button type="button" onClick={() => removeFilterBadge("status")} className="hover:opacity-75 ml-0.5">✕</button>
              </span>
            )}
            {filters.sessionId && (
              <span className="inline-flex max-w-full items-center gap-1 px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-mono">
                Session: <strong className="truncate">{filters.sessionId}</strong>
                <button type="button" onClick={() => removeFilterBadge("session")} className="hover:opacity-75 ml-0.5">✕</button>
              </span>
            )}
            {Object.entries(filters.metadata || {}).map(([k, v]) => v ? (
              <span key={k} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-mono">
                {k}: <strong>{v}</strong>
                <button type="button" onClick={() => removeFilterBadge("metadata", k)} className="hover:opacity-75 ml-0.5">✕</button>
              </span>
            ) : null)}
            {filters.startDate && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/5 dark:bg-white/5 border border-border">
                From: {filters.startDate}
                <button type="button" onClick={() => removeFilterBadge("startDate")} className="hover:opacity-75 ml-0.5">✕</button>
              </span>
            )}
            {filters.endDate && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/5 dark:bg-white/5 border border-border">
                To: {filters.endDate}
                <button type="button" onClick={() => removeFilterBadge("endDate")} className="hover:opacity-75 ml-0.5">✕</button>
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Clean, High-Hierarchy Request Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.015] dark:bg-white/[0.015] text-xs uppercase tracking-wider text-text-muted font-semibold">
                <th className="text-left py-3.5 px-4">Status & Time</th>
                <th className="text-left py-3.5 px-4">Origin / Agent</th>
                <th className="text-left py-3.5 px-4">Model & Provider</th>
                <th className="text-left py-3.5 px-4">Tokens</th>
                <th className="text-left py-3.5 px-4">Latency</th>
                <th className="text-center py-3.5 px-4 w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-text-muted">
                    <div className="flex items-center justify-center gap-2 text-sm font-medium">
                      <span className="material-symbols-outlined animate-spin text-[22px]">progress_activity</span>
                      Loading requests...
                    </div>
                  </td>
                </tr>
              ) : details.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-text-muted">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[36px] text-text-muted/40">inbox</span>
                      <p className="font-medium text-sm">No request details found</p>
                      {activeFiltersCount > 0 && (
                        <Button variant="outline" size="sm" onClick={handleClearFilters} className="mt-2 text-xs">
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                details.map((detail, index) => {
                  const input = getInputTokens(detail.tokens);
                  const cached = getCachedTokens(detail.tokens);
                  const output = detail.tokens?.completion_tokens ?? 0;
                  const displayStatus = getDisplayStatus(detail);
                  const isSuccess = displayStatus === "success" || displayStatus === "ok";
                  const isStreaming = displayStatus === "streaming";
                  const isAborted = displayStatus === "aborted";
                  const isError = displayStatus && !isSuccess && !isStreaming && !isAborted;
                  const badgeVariant = isSuccess ? "success" : isError ? "error" : isAborted ? "warning" : isStreaming ? "info" : "default";
                  const meta = detail.agentMetadata || detail.data?.agentMetadata || {};
                  const agentName = meta["agent-name"] || meta.agent || null;
                  const hostname = meta.hostname || null;
                  const osName = meta.os || null;
                  const classification = classifyRequest(detail);

                  return (
                    <tr
                      key={`${detail.id}-${index}`}
                      onClick={() => handleViewDetail(detail)}
                      className="hover:bg-black/[0.025] dark:hover:bg-white/[0.025] cursor-pointer transition-colors group"
                    >
                      {/* Status & Time */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={badgeVariant} size="sm" dot>
                              {displayStatus}
                            </Badge>
                            <span className="text-[11px] font-mono text-text-muted">
                              {formatTimestamp(detail.timestamp)}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-text-muted/70 flex items-center gap-1 group-hover:text-text-muted">
                            <span>ID: {String(detail.id).slice(0, 8)}…</span>
                          </div>
                          {detail.errorLabel && (
                            <span className="text-[10px] text-red-600 dark:text-red-400 font-medium truncate max-w-[220px]" title={detail.errorLabel}>
                              {detail.errorLabel}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Origin / Agent */}
                      <td className="py-3.5 px-4 align-top max-w-[220px]">
                        {agentName || hostname ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-text-main text-xs truncate">
                              {agentName ? `${agentName}` : "Generic Agent"}
                              {hostname ? <span className="text-text-muted font-normal"> @ {hostname}</span> : null}
                            </span>
                            <span className="font-mono text-[10px] text-text-muted truncate">
                              {osName || "—"} {meta.mode ? `· ${meta.mode}` : ""}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Badge variant={classification.isToolCall ? "primary" : "neutral"} size="sm">
                                {classification.requestType}
                              </Badge>
                              {classification.isToolCall && (
                                <span className="text-[10px] text-text-muted">
                                  {classification.toolCallCount} call{classification.toolCallCount === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-text-muted font-mono">
                            <span>API Client</span>
                            <div className="mt-1">
                              <Badge variant={classification.isToolCall ? "primary" : "neutral"} size="sm">
                                {classification.requestType}
                              </Badge>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Model & Provider */}
                      <td className="py-3.5 px-4 align-top max-w-[240px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs font-semibold text-text-main truncate" title={detail.model}>
                            {detail.model || "—"}
                          </span>
                          <span className="font-mono text-[11px] text-text-muted truncate" title={detail.provider}>
                            {getProviderName(detail.provider, providerNameCache)}
                            {detail.connectionId && (
                              <span className="opacity-75"> ({getConnectionName(detail.connectionId, connectionCache)})</span>
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Tokens */}
                      <td className="py-3.5 px-4 align-top font-mono text-xs whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sky-600 dark:text-sky-400 font-medium">{input.toLocaleString()} in</span>
                            {cached > 0 && (
                              <span className="text-[10px] px-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold" title={`Cached prompt tokens: ${cached.toLocaleString()}`}>
                                ↻{cached.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <span className="text-violet-600 dark:text-violet-400 font-medium">{output.toLocaleString()} out</span>
                        </div>
                      </td>

                      {/* Latency */}
                      <td className="py-3.5 px-4 align-top font-mono text-xs whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn(
                            "font-semibold",
                            (detail.latency?.total || 0) > 5000
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-text-main"
                          )}>
                            {detail.latency?.total ? `${(detail.latency.total / 1000).toFixed(2)}s` : "—"}
                          </span>
                          <span className="text-[10px] text-text-muted">
                            TTFT: {detail.latency?.ttft ? `${detail.latency.ttft}ms` : "—"}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 align-top text-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetail(detail)}
                          className="text-xs h-7 px-2.5"
                        >
                          Detail
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Pagination
        currentPage={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      {/* Modern 50% Tabbed Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Request Details"
        width="half"
        headerContent={selectedDetail && (
          <>
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/5 px-6 py-3.5 text-xs dark:border-white/5">
              <div className="flex items-center gap-2">
                <Badge
                  variant={selectedDisplayStatus === "success" || selectedDisplayStatus === "ok" ? "success" : selectedDisplayStatus === "aborted" ? "warning" : selectedDisplayStatus === "streaming" ? "info" : "error"}
                  size="sm"
                  dot
                >
                  {selectedDisplayStatus}
                </Badge>
                <span className="font-mono text-text-muted">{formatTimestamp(selectedDetail.timestamp)}</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span>⏱ {(selectedDetail.latency?.total || 0)}ms</span>
                <span>·</span>
                <span>Tokens: <strong className="text-sky-600">{getInputTokens(selectedDetail.tokens)} in</strong> / <strong className="text-violet-600">{selectedDetail.tokens?.completion_tokens || 0} out</strong></span>
              </div>
            </div>
            <div role="tablist" aria-label="Request detail tabs" className="flex flex-shrink-0 gap-2 overflow-x-auto border-b border-black/10 px-6 dark:border-white/10">
              {drawerTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeDrawerTab === tab.id}
                  onClick={() => setActiveDrawerTab(tab.id)}
                  className={cn(
                    "whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition-all flex items-center gap-1.5",
                    activeDrawerTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-text-muted hover:text-text-main"
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </>
        )}
      >
        {selectedDetail && (
          <div className="space-y-5">
            {/* Tab 1: Conversation Preview */}
            {activeDrawerTab === "preview" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-text-main uppercase tracking-wider text-[11px]">Conversation Preview</h4>
                  <CopyIconButton
                    value={formatConversationForCopy(selectedMessages)}
                    copyId="drawer-conversation"
                    copied={copied}
                    onCopy={copy}
                    label="Copy conversation"
                  />
                </div>
                {selectedMessages.length === 0 ? (
                  <div className="p-8 text-center text-text-muted text-xs font-medium">
                    No conversation messages found in payload.
                  </div>
                ) : (
                  selectedMessages.map((msg, mIdx) => {
                    const isUser = msg.role === "user";
                    const isAssistant = msg.role === "assistant";
                    const isSystem = msg.role === "system" || msg.role === "developer";

                    return (
                      <div key={mIdx} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
                          <span className="material-symbols-outlined text-[16px]">
                            {isUser ? "person" : isAssistant ? "smart_toy" : "settings"}
                          </span>
                          <span>{msg.role}</span>
                        </div>
                        {msg.thinking && (
                          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-900 dark:text-amber-200">
                            <span className="font-semibold block mb-1 uppercase text-[10px] tracking-wider text-amber-600">Thinking Process:</span>
                            <pre className="whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto">{msg.thinking}</pre>
                          </div>
                        )}
                        <div className={cn(
                          "p-4 rounded-xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans border",
                          isUser
                            ? "bg-primary/5 border-primary/15 text-text-main"
                            : isAssistant
                            ? msg.isError
                              ? "bg-red-500/10 border-red-500/20 text-red-600"
                              : "bg-surface border-border text-text-main"
                            : "bg-black/[0.02] dark:bg-white/[0.02] border-border/50 text-text-muted font-mono text-xs"
                        )}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 2: Agent Metadata & Routing Info */}
            {activeDrawerTab === "metadata" && (
              <div className="space-y-5 animate-in fade-in duration-150 text-xs">
                {/* Stream Diagnosis */}
                <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-text-main uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-amber-500">monitor_heart</span>
                        Stream Diagnosis
                      </h4>
                      <p className="mt-2 text-xs leading-relaxed text-text-muted">{lifecycle.explanation}</p>
                    </div>
                    <Badge variant={lifecycle.badgeVariant} size="sm">{lifecycle.label}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Likely source</span>
                      <span className="text-text-main font-semibold">{lifecycle.source}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Termination</span>
                      <span className="text-text-main font-semibold break-all">{lifecycle.termination}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Reason</span>
                      <span className="text-text-main font-semibold break-all">{lifecycle.reason}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Provider / client bytes</span>
                      <span className="text-text-main font-semibold">{Number(lifecycle.metrics.providerBytes) || 0} / {Number(lifecycle.metrics.clientBytes) || 0}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Upstream EOF</span>
                      <span className="text-text-main font-semibold">{lifecycle.metrics.upstreamEnded === true ? "yes" : "no"}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Tool calls</span>
                      <span className="text-text-main font-semibold">{getToolCalls(selectedDetail).length}</span>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <CopyIconButton
                      value={JSON.stringify({
                        source: lifecycle.source,
                        label: lifecycle.label,
                        explanation: lifecycle.explanation,
                        termination: lifecycle.termination,
                        reason: lifecycle.reason,
                        metrics: lifecycle.metrics,
                      }, null, 2)}
                      copyId="drawer-diagnosis"
                      copied={copied}
                      onCopy={copy}
                      label="Copy stream diagnosis"
                    />
                  </div>
                </div>

                {/* Routing Box */}
                <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-text-main uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-primary">route</span>
                      Routing Details
                    </h4>
                    <CopyIconButton
                      value={JSON.stringify({
                        requestId: selectedDetail.id,
                        provider: selectedDetail.provider,
                        model: selectedDetail.model,
                        connectionId: selectedDetail.connectionId,
                        sessionId: getRawSessionId(selectedDetail) || getSessionId(selectedDetail),
                      }, null, 2)}
                      copyId="drawer-routing"
                      copied={copied}
                      onCopy={copy}
                      label="Copy routing details"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Request ID</span>
                      <span className="font-mono text-text-main font-semibold break-all">{selectedDetail.id}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Provider / Model</span>
                      <span className="font-mono text-text-main font-semibold">{getProviderName(selectedDetail.provider, providerNameCache)} / {selectedDetail.model}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Account</span>
                      <span className="font-mono text-text-main break-all">{getConnectionName(selectedDetail.connectionId, connectionCache)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase">Session ID</span>
                      <span className="font-mono text-text-main break-all">{getRawSessionId(selectedDetail) || getSessionId(selectedDetail) || "—"}</span>
                    </div>
                  </div>
                  {(getSessionId(selectedDetail) || getRawSessionId(selectedDetail)) && (
                    <div className="flex justify-end border-t border-border/60 pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        icon="filter_alt"
                        onClick={() => handleSessionFilter(getSessionId(selectedDetail) || getRawSessionId(selectedDetail))}
                        className="text-xs"
                      >
                        Filter this session
                      </Button>
                    </div>
                  )}
                </div>

                {/* Agent Metadata Box */}
                {selectedDetail.agentMetadata && Object.keys(selectedDetail.agentMetadata).length > 0 ? (
                  <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-text-main uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-purple-500">smart_toy</span>
                        Agent Metadata
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={copied === "drawer-meta" ? "check" : "content_copy"}
                        onClick={() => copy(JSON.stringify(selectedDetail.agentMetadata, null, 2), "drawer-meta")}
                        className="text-xs h-7"
                      >
                        {copied === "drawer-meta" ? "Copied!" : "Copy JSON"}
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
                      {Object.entries(selectedDetail.agentMetadata).map(([k, v]) => (
                        <div key={k} className="p-2.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.03] border border-border/60">
                          <span className="text-text-muted block text-[10px] font-sans font-medium uppercase tracking-wider">{k}</span>
                          <span className="text-text-main font-semibold break-all">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-dashed border-border text-center text-text-muted">
                    No agent metadata attached to this request.
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Raw Payloads */}
            {activeDrawerTab === "raw" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <CollapsibleSection
                  title="1. Client Request (Input)"
                  defaultOpen={true}
                  icon="input"
                  copyValue={formatJsonPayload(selectedDetail.request)}
                  copyId="client-request"
                  copied={copied}
                  onCopy={copy}
                >
                  <pre className="max-h-[320px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                    {formatJsonPayload(selectedDetail.request)}
                  </pre>
                </CollapsibleSection>

                {selectedDetail.providerRequest && (
                  <CollapsibleSection
                    title="2. Provider Request (Translated)"
                    icon="translate"
                    copyValue={formatJsonPayload(selectedDetail.providerRequest)}
                    copyId="provider-request"
                    copied={copied}
                    onCopy={copy}
                  >
                    <pre className="max-h-[320px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                      {formatJsonPayload(selectedDetail.providerRequest)}
                    </pre>
                  </CollapsibleSection>
                )}

                {selectedDetail.providerResponse && (
                  <CollapsibleSection
                    title="3. Provider Response (Raw)"
                    icon="data_object"
                    copyValue={formatJsonPayload(selectedDetail.providerResponse)}
                    copyId="provider-response"
                    copied={copied}
                    onCopy={copy}
                  >
                    <pre className="max-h-[320px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                      {formatJsonPayload(selectedDetail.providerResponse)}
                    </pre>
                  </CollapsibleSection>
                )}

                <CollapsibleSection
                  title="4. Client Response (Final)"
                  defaultOpen={true}
                  icon="output"
                  copyValue={formatJsonPayload(selectedDetail.response)}
                  copyId="client-response"
                  copied={copied}
                  onCopy={copy}
                >
                  <pre className="max-h-[320px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                    {formatJsonPayload(selectedDetail.response)}
                  </pre>
                </CollapsibleSection>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
