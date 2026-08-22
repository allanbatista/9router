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
  if (!detail) return null;
  if (detail.cacheKey) return String(detail.cacheKey);
  if (detail.cache_key) return String(detail.cache_key);
  const pr = detail.providerRequest;
  if (pr && typeof pr === "object" && !pr.redacted) {
    const sid = pr?.request?.sessionId;
    if (sid != null && String(sid).trim() !== "") return String(sid);
    if (pr.prompt_cache_key) return String(pr.prompt_cache_key);
    if (pr.session_id) return String(pr.session_id);
    if (pr.conversation_id) return String(pr.conversation_id);
    if (pr.requestId) {
      const m = String(pr.requestId).match(/^agent\/([0-9a-f-]{36})\//i);
      if (m) return m[1];
    }
  }
  const rq = detail.request;
  if (rq && typeof rq === "object" && !rq.redacted) {
    if (rq.prompt_cache_key) return String(rq.prompt_cache_key);
    if (Array.isArray(rq._agent_metadata)) {
      const session = rq._agent_metadata.find((item) => item?.key === "session-id")?.value;
      if (session != null && String(session).trim() !== "") return String(session);
    }
    if (rq.session_id) return String(rq.session_id);
  }
  return null;
}
function getRawSessionId(detail) {
  if (!detail) return null;
  if (detail.rawSessionId) return String(detail.rawSessionId);
  if (detail.rawSession_id) return String(detail.rawSession_id);
  const rq = detail.request;
  if (rq && typeof rq === "object" && !rq.redacted) {
    if (rq.prompt_cache_key) return String(rq.prompt_cache_key);
    if (rq.session_id) return String(rq.session_id);
    if (rq.conversation_id) return String(rq.conversation_id);
  }
  return null;
}
function getSessionId(detail) {
  if (!detail) return null;
  if (detail.sessionId) return String(detail.sessionId);
  if (detail.session_id) return String(detail.session_id);
  return getCacheKey(detail);
}
function getConversationId(detail) {
  if (!detail) return null;
  if (detail.conversationId) return String(detail.conversationId);
  if (detail.conversation_id) return String(detail.conversation_id);
  const pr = detail.providerRequest;
  if (pr && typeof pr === "object" && !pr.redacted && pr.requestId) {
    const m = String(pr.requestId).match(/^agent\/([0-9a-f-]{36})\//i);
    if (m) return m[1];
  }
  return null;
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
  const [activeDrawerTab, setActiveDrawerTab] = useState("preview"); // "preview" | "metadata" | "raw"
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
    setActiveDrawerTab("preview");
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
    setFilters({ provider: "", status: "", startDate: "", endDate: "", metadata: {} });
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
    (filters.startDate ? 1 : 0) +
    (filters.endDate ? 1 : 0) +
    Object.values(filters.metadata || {}).filter(Boolean).length;

  // Extract conversation messages for preview
  const extractMessages = (detail) => {
    if (!detail) return [];
    const rq = detail.request || {};
    const pr = detail.providerRequest || {};
    const rawMsgs = rq.messages || rq.contents || pr.messages || pr.contents || [];
    const out = [];
    if (Array.isArray(rawMsgs)) {
      for (const m of rawMsgs) {
        const role = m.role || (m.parts ? "user" : "user");
        let text = "";
        if (typeof m.content === "string") text = m.content;
        else if (Array.isArray(m.content)) {
          text = m.content.map(c => typeof c === "string" ? c : c.text || JSON.stringify(c)).join("\n");
        } else if (Array.isArray(m.parts)) {
          text = m.parts.map(p => typeof p === "string" ? p : p.text || JSON.stringify(p)).join("\n");
        } else if (m.text) text = m.text;
        out.push({ role, text: text || "[Empty or non-text message]" });
      }
    }
    // Append assistant final response
    const resp = detail.response || {};
    if (resp.content && resp.content !== "[No content]") {
      out.push({ role: "assistant", text: resp.content, thinking: resp.thinking });
    } else if (resp.error) {
      out.push({ role: "assistant", text: `[Error: ${resp.error}]`, isError: true });
    }
    return out;
  };

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
                  const isSuccess = detail.status === "success" || detail.status === "ok";
                  const isStreaming = detail.status === "streaming";
                  const isError = detail.status && !isSuccess && !isStreaming;
                  const badgeVariant = isSuccess ? "success" : isError ? "error" : isStreaming ? "default" : "default";
                  const meta = detail.agentMetadata || detail.data?.agentMetadata || {};
                  const agentName = meta["agent-name"] || meta.agent || null;
                  const hostname = meta.hostname || null;
                  const osName = meta.os || null;

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
                              {detail.status || "unknown"}
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
                          </div>
                        ) : (
                          <div className="text-xs text-text-muted font-mono">
                            <span>API Client</span>
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
      >
        {selectedDetail && (
          <div className="space-y-5">
            {/* Drawer Header Badges Bar */}
            <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Badge
                  variant={selectedDetail.status === "success" ? "success" : selectedDetail.status === "streaming" ? "default" : "error"}
                  size="sm"
                  dot
                >
                  {selectedDetail.status}
                </Badge>
                <span className="font-mono text-text-muted">{formatTimestamp(selectedDetail.timestamp)}</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span>⏱ {(selectedDetail.latency?.total || 0)}ms</span>
                <span>·</span>
                <span>Tokens: <strong className="text-sky-600">{getInputTokens(selectedDetail.tokens)} in</strong> / <strong className="text-violet-600">{selectedDetail.tokens?.completion_tokens || 0} out</strong></span>
              </div>
            </div>

            {/* Drawer Sub-Tabs */}
            <div className="flex border-b border-black/10 dark:border-white/10 gap-2">
              <button
                type="button"
                onClick={() => setActiveDrawerTab("preview")}
                className={cn(
                  "py-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5",
                  activeDrawerTab === "preview"
                    ? "border-primary text-primary"
                    : "border-transparent text-text-muted hover:text-text-main"
                )}
              >
                <span className="material-symbols-outlined text-[16px]">forum</span>
                Conversation Preview
              </button>
              <button
                type="button"
                onClick={() => setActiveDrawerTab("metadata")}
                className={cn(
                  "py-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5",
                  activeDrawerTab === "metadata"
                    ? "border-primary text-primary"
                    : "border-transparent text-text-muted hover:text-text-main"
                )}
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
                Agent & Routing
              </button>
              <button
                type="button"
                onClick={() => setActiveDrawerTab("raw")}
                className={cn(
                  "py-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5",
                  activeDrawerTab === "raw"
                    ? "border-primary text-primary"
                    : "border-transparent text-text-muted hover:text-text-main"
                )}
              >
                <span className="material-symbols-outlined text-[16px]">data_object</span>
                Raw Payloads
              </button>
            </div>

            {/* Tab 1: Conversation Preview */}
            {activeDrawerTab === "preview" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {extractMessages(selectedDetail).length === 0 ? (
                  <div className="p-8 text-center text-text-muted text-xs font-medium">
                    No conversation messages found in payload.
                  </div>
                ) : (
                  extractMessages(selectedDetail).map((msg, mIdx) => {
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
                {/* Routing Box */}
                <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
                  <h4 className="font-semibold text-text-main uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">route</span>
                    Routing Details
                  </h4>
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
                        onClick={() => copy("drawer-meta", JSON.stringify(selectedDetail.agentMetadata, null, 2))}
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
