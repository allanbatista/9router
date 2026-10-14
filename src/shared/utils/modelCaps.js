import { getCapabilitiesForModel } from "../../../open-sse/providers/capabilities.js";

// Resolve caps from a "provider/model" string or a bare model id.
export function resolveCaps(byFull, byId, rawKey) {
  if (!rawKey) return null;
  const key = rawKey.replace(/\([^()]+\)\s*$/, "").trim();
  if (byFull[key]) return byFull[key];
  const separatorIndex = key.indexOf("/");
  const provider = separatorIndex === -1 ? null : key.slice(0, separatorIndex);
  const bare = separatorIndex === -1 ? key : key.slice(separatorIndex + 1);
  if (byId[bare]) return byId[bare];
  const c = getCapabilitiesForModel(provider, bare);
  return {
    vision: c.vision,
    search: c.search,
    reasoning: c.reasoning,
    contextWindow: c.contextWindow,
    maxOutput: c.maxOutput,
  };
}
