"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Badge from "@/shared/components/Badge";
import Drawer from "@/shared/components/Drawer";
import Pagination from "@/shared/components/Pagination";
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

function CollapsibleSection({ title, children, defaultOpen = false, icon = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-black/5 dark:border-white/5 rounded-lg overflow-hidden">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="material-symbols-outlined text-[18px] text-text-muted">{icon}</span>}
          <span className="font-semibold text-sm text-text-main">{title}</span>
        </div>
        <span className={cn(
          "material-symbols-outlined text-[20px] text-text-muted transition-transform duration-200",
          isOpen ? "rotate-90" : ""
        )}>
          chevron_right
        </span>
      </button>
      
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
  const [providers, setProviders] = useState([]);
  const [providerNameCache, setProviderNameCache] = useState(null);
  const [connectionCache, setConnectionCache] = useState(null);
  const [filters, setFilters] = useState({
    provider: "",
    startDate: "",
    endDate: ""
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
    } catch (error) {
      console.error("Failed to fetch providers:", error);
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
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);

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
    setIsDrawerOpen(true);
    try {
      const res = await fetch(`/api/usage/request-details/${encodeURIComponent(detail.id)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.detail) {
        setSelectedDetail((prev) => ({ ...data.detail, cacheKey: data.detail.cacheKey ?? prev?.cacheKey, rawSessionId: data.detail.rawSessionId ?? prev?.rawSessionId, sessionId: data.detail.sessionId ?? prev?.sessionId, conversationId: data.detail.conversationId ?? prev?.conversationId }));
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
    setFilters({ provider: "", startDate: "", endDate: "" });
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

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card padding="md">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="provider-filter" className="text-sm font-medium text-text-main">Provider</label>
            <select
              id="provider-filter"
              value={filters.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className={cn(
                "h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface",
                "text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20",
                "w-full min-w-0 cursor-pointer"
              )}
              style={{ colorScheme: 'auto' }}
            >
              <option value="">All Providers</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="start-date-filter" className="text-sm font-medium text-text-main">Start Date</label>
            <input
              id="start-date-filter"
              type="datetime-local"
              value={filters.startDate}
              onChange={(e) => handleDateChange("startDate", e.target.value)}
              className={cn(
                "h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface",
                "w-full min-w-0 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
              )}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="end-date-filter" className="text-sm font-medium text-text-main">End Date</label>
            <input
              id="end-date-filter"
              type="datetime-local"
              value={filters.endDate}
              onChange={(e) => handleDateChange("endDate", e.target.value)}
              className={cn(
                "h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface",
                "w-full min-w-0 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
              )}
            />
          </div>
          
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-1">
            <span className="hidden text-sm font-medium text-text-main opacity-0 lg:block" aria-hidden="true">Refresh</span>
            <Button
              variant="outline"
              onClick={() => fetchDetails()}
              disabled={loading}
              icon={loading ? "progress_activity" : "refresh"}
              className={loading ? "animate-pulse" : ""}
            >
              Refresh
            </Button>
          </div>
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-1">
            <span className="hidden text-sm font-medium text-text-main opacity-0 lg:block" aria-hidden="true">Clear</span>
            <Button 
              variant="ghost" 
              onClick={handleClearFilters}
              disabled={!filters.provider && !filters.startDate && !filters.endDate}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </Card>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/5">
                <th className="text-left p-4 text-sm font-semibold text-text-main">Request</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Model</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Tokens</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Latency</th>
                <th className="text-center p-4 text-sm font-semibold text-text-main">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-text-muted">
                    <div className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : details.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-text-muted">
                    No request details found
                  </td>
                </tr>
              ) : (
                details.map((detail, index) => {
                  const input = getInputTokens(detail.tokens);
                  const cached = getCachedTokens(detail.tokens);
                  const diff = Math.max(0, input - cached);
                  const output = detail.tokens?.completion_tokens ?? 0;
                  const cacheKey = getCacheKey(detail);
                  const rawSessionId = getRawSessionId(detail);
                  const isSuccess = detail.status === "success" || detail.status === "ok";
                  const isError = detail.status && !isSuccess && detail.status !== "pending";
                  const badgeVariant = isSuccess ? "success" : isError ? "error" : "default";
                  return (
                  <tr
                    key={`${detail.id}-${index}`}
                    className="border-b border-black/5 dark:border-white/5 last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="p-4 align-top">
                      <div className="flex min-w-0 flex-col gap-1.5 max-w-[260px]">
                        <div className="font-mono text-xs break-all leading-tight text-text-main" title={detail.id}>{detail.id}</div>
                        <div className="font-mono text-[10px] break-all leading-tight text-text-muted" title={cacheKey || ""}>ck: {cacheKey || "—"}</div>
                        <div className="font-mono text-[10px] break-all leading-tight text-text-muted" title={rawSessionId || ""}>session: {rawSessionId || "—"}</div>
                        <div className="font-mono text-[10px] leading-none text-text-muted">{formatTimestamp(detail.timestamp)}</div>
                        <div><Badge variant={badgeVariant} size="sm" dot>{detail.status || "unknown"}</Badge></div>
                        {detail.errorLabel ? <div className="text-[10px] leading-tight text-red-600 dark:text-red-400" title={detail.errorLabel}>{detail.errorLabel}</div> : null}
                      </div>
                    </td>
                    <td className="max-w-[280px] p-4 text-sm align-top">
                      <div className="truncate font-mono text-[11px] leading-none text-text-muted">{getProviderName(detail.provider, providerNameCache)}</div>
                      <div className="truncate font-mono text-sm text-text-main">{detail.model}</div>
                      <div className="truncate font-mono text-xs text-text-muted" title={detail.connectionId || ""}>{getConnectionName(detail.connectionId, connectionCache)}</div>
                    </td>
                    <td className="p-4 text-sm font-mono align-top">
                      <div className="whitespace-nowrap">
                        <span className="text-sky-600 dark:text-sky-400">{input.toLocaleString()}</span>
                        <span className="text-text-muted"> - </span>
                        <span className="text-amber-600 dark:text-amber-400">{cached.toLocaleString()}</span>
                        <span className="text-text-muted"> = </span>
                        <span className="font-semibold text-text-main">{diff.toLocaleString()}</span>
                        <span className="text-text-muted"> / </span>
                        <span className="text-violet-600 dark:text-violet-400">{output.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-text-muted align-top">
                      <div className="flex flex-col gap-0.5">
                        <div>TTFT: <span className="font-mono">{detail.latency?.ttft || 0}ms</span></div>
                        <div>Total: <span className="font-mono">{detail.latency?.total || 0}ms</span></div>
                      </div>
                    </td>
                    <td className="p-4 text-center align-top">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetail(detail)}
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
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Request Details"
        width="lg"
      >
        {selectedDetail && (
          <div className="space-y-6">
            <div className="grid min-w-0 grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <span className="text-text-muted">ID:</span>{" "}
                <span className="break-all font-mono text-text-main">{selectedDetail.id}</span>
              </div>
              <div>
                <span className="text-text-muted">Timestamp:</span>{" "}
                <span className="text-text-main">{formatTimestamp(selectedDetail.timestamp)}</span>
              </div>
              <div>
                 <span className="text-text-muted">Provider:</span>{" "}
                 <span className="text-text-main font-medium">{getProviderName(selectedDetail.provider, providerNameCache)}</span>
               </div>
              <div>
                <span className="text-text-muted">Account:</span>{" "}
                <span className="text-text-main font-mono text-xs break-all" title={selectedDetail.connectionId || ""}>{getConnectionName(selectedDetail.connectionId, connectionCache)}</span>
              </div>
              <div>
                <span className="text-text-muted">Model:</span>{" "}
                <span className="text-text-main font-mono">{selectedDetail.model}</span>
              </div>
              <div>
                <span className="text-text-muted">Cache Key:</span>{" "}
                <span className="font-mono text-xs break-all text-text-main" title={getCacheKey(selectedDetail) || ""}>{getCacheKey(selectedDetail) ? (getCacheKey(selectedDetail).length > 36 ? `${getCacheKey(selectedDetail).slice(0, 18)}…${getCacheKey(selectedDetail).slice(-8)}` : getCacheKey(selectedDetail)) : "—"}</span>
                {getRawSessionId(selectedDetail) && getRawSessionId(selectedDetail) !== getCacheKey(selectedDetail) ? <div className="font-mono text-[10px] leading-none text-text-muted/70 break-all mt-1" title={getRawSessionId(selectedDetail)}>{getRawSessionId(selectedDetail)}</div> : null}
              </div>
              <div>
                <span className="text-text-muted">Session ID:</span>{" "}
                <span className="font-mono text-xs break-all text-text-main" title={getRawSessionId(selectedDetail) || getSessionId(selectedDetail) || ""}>{getRawSessionId(selectedDetail) || getSessionId(selectedDetail) || "—"}</span>
              </div>
              {getConversationId(selectedDetail) ? (
              <div>
                <span className="text-text-muted">Conversation:</span>{" "}
                <span className="font-mono text-xs break-all text-text-main" title={getConversationId(selectedDetail) || ""}>{getConversationId(selectedDetail)}</span>
              </div>
              ) : null}
              <div>
                <span className="text-text-muted">Status:</span>{" "}
                <span className={cn(
                  "font-medium",
                  selectedDetail.status === "success" ? "text-green-600" : "text-red-600"
                )}>
                  {selectedDetail.status}
                </span>
              </div>
              {selectedDetail.errorLabel || selectedDetail.error || selectedDetail.response?.error ? (
                <div className="sm:col-span-2">
                  <span className="text-text-muted">Error:</span>{" "}
                  <span className="break-words text-red-600 dark:text-red-400">
                    {selectedDetail.errorLabel || selectedDetail.error || selectedDetail.response?.error}
                  </span>
                </div>
              ) : null}
              <div>
                <span className="text-text-muted">Latency:</span>{" "}
                <span className="text-text-main font-mono">
                  TTFT {selectedDetail.latency?.ttft || 0}ms / Total {selectedDetail.latency?.total || 0}ms
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-text-muted">Tokens:</span>{" "}
                {(() => { const input = getInputTokens(selectedDetail.tokens); const cached = getCachedTokens(selectedDetail.tokens); const diff = Math.max(0, input - cached); const out = selectedDetail.tokens?.completion_tokens ?? 0; return (
                <span className="font-mono">
                  <span className="text-sky-600 dark:text-sky-400">{input.toLocaleString()}</span>
                  <span className="text-text-muted"> - </span>
                  <span className="text-amber-600 dark:text-amber-400">{cached.toLocaleString()}</span>
                  <span className="text-text-muted"> = </span>
                  <span className="font-semibold text-text-main">{diff.toLocaleString()}</span>
                  <span className="text-text-muted"> / </span>
                  <span className="text-violet-600 dark:text-violet-400">{out.toLocaleString()}</span>
                </span>
                ); })()}
              </div>
              {getCacheCreationTokens(selectedDetail.tokens) > 0 && (
                <div>
                  <span className="text-text-muted">Cache Creation:</span>{" "}
                  <span className="text-text-main font-mono">
                    {getCacheCreationTokens(selectedDetail.tokens).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {selectedDetail.pxpipe && (
              <div className="rounded-lg border border-black/5 dark:border-white/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[18px] text-text-muted">image</span>
                  <span className="font-semibold text-sm text-text-main">PXPIPE</span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded",
                    selectedDetail.pxpipe.applied
                      ? "bg-green-500/15 text-green-600"
                      : "bg-amber-500/15 text-amber-600"
                  )}>
                    {selectedDetail.pxpipe.applied ? "Activated" : "Skipped"}
                  </span>
                </div>
                {selectedDetail.pxpipe.applied ? (
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div>
                      <span className="text-text-muted block text-xs">Original (est.)</span>
                      <span className="font-mono">{(selectedDetail.pxpipe.tokensBeforeEst || 0).toLocaleString()} tokens</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-xs">Compressed (est.)</span>
                      <span className="font-mono">{(selectedDetail.pxpipe.tokensAfterEst || 0).toLocaleString()} tokens</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-xs">Saved</span>
                      <span className="font-mono text-green-600">{selectedDetail.pxpipe.savedPct || 0}%</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-xs">Images</span>
                      <span className="font-mono">{selectedDetail.pxpipe.imageCount || 0} ({selectedDetail.pxpipe.durationMs || 0}ms)</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">
                    Reason: <span className="font-mono">{selectedDetail.pxpipe.reason}</span>
                    {selectedDetail.pxpipe.detail ? ` — ${selectedDetail.pxpipe.detail}` : ""}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-4">
              <CollapsibleSection title="1. Client Request (Input)" defaultOpen={true} icon="input">
                <pre className="max-h-[300px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                  {JSON.stringify(selectedDetail.request, null, 2)}
                </pre>
              </CollapsibleSection>

              {selectedDetail.providerRequest && (
                <CollapsibleSection title="2. Provider Request (Translated)" icon="translate">
                  <pre className="max-h-[300px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                    {JSON.stringify(selectedDetail.providerRequest, null, 2)}
                  </pre>
                </CollapsibleSection>
              )}

              {selectedDetail.providerResponse && (
                <CollapsibleSection title="3. Provider Response (Raw)" icon="data_object">
                  <pre className="max-h-[300px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                    {typeof selectedDetail.providerResponse === 'object'
                      ? JSON.stringify(selectedDetail.providerResponse, null, 2)
                      : selectedDetail.providerResponse
                    }
                  </pre>
                </CollapsibleSection>
              )}
              
              <CollapsibleSection title="4. Client Response (Final)" defaultOpen={true} icon="output">
                {selectedDetail.response?.thinking && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-text-main mb-2 flex items-center gap-2 text-xs uppercase tracking-wide opacity-70">
                      <span className="material-symbols-outlined text-[16px]">psychology</span>
                      Thinking Process
                    </h4>
                    <pre className="max-h-[200px] max-w-full overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-3 font-mono text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 sm:p-4">
                      {selectedDetail.response.thinking}
                    </pre>
                  </div>
                )}
                
                <h4 className="font-semibold text-text-main mb-2 text-xs uppercase tracking-wide opacity-70">
                  Content
                </h4>
                <pre className="max-h-[300px] max-w-full overflow-auto rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4">
                  {selectedDetail.response?.content || "[No content]"}
                </pre>
              </CollapsibleSection>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
