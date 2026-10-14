/**
 * Model Fallback & Virtual Family Definitions
 *
 * Defines fallback chains for model families across versions and tiers.
 * Supports virtual dynamic models such as "gemini-current-flash", "gemini-current-pro", "claude-current-sonnet", etc.
 */

export const MODEL_FAMILIES = {
  "gemini-flash": [
    "gemini-3.8-flash",
    "gemini-3.8-flash-high",
    "gemini-3.8-flash-medium",
    "gemini-3.8-flash-low",
    "gemini-3.7-flash",
    "gemini-3.7-flash-high",
    "gemini-3.7-flash-medium",
    "gemini-3.7-flash-low",
    "gemini-3.6-flash",
    "gemini-3.6-flash-high",
    "gemini-3.6-flash-medium",
    "gemini-3.6-flash-low",
    "gemini-3.5-flash-high",
    "gemini-3.5-flash-low",
    "gemini-3.5-flash-extra-low",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ],
  "gemini-pro": [
    "gemini-3.8-pro",
    "gemini-3.7-pro",
    "gemini-3.1-pro-preview",
    "gemini-pro-agent",
    "gemini-3.1-pro-low",
    "gemini-2.5-pro",
    "gemini-2.0-pro-exp-02-05",
  ],
  "claude-sonnet": [
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-3-7-sonnet",
    "claude-3-7-sonnet-20250219",
    "claude-3.7-sonnet",
    "claude-3-5-sonnet",
    "claude-3-5-sonnet-20241022",
  ],
  "claude-opus": [
    "claude-opus-4-6-thinking",
    "claude-opus-4-5",
    "claude-3-5-opus",
    "claude-3-opus",
    "claude-3-opus-20240229",
  ],
  "claude-haiku": [
    "claude-haiku-4-5",
    "claude-3-5-haiku",
    "claude-3-5-haiku-20241022",
    "claude-3-haiku",
    "claude-3-haiku-20240307",
  ],
  "gpt-flagship": [
    "gpt-5.5",
    "gpt-5.4-pro",
    "gpt-5.4",
    "gpt-4.5-preview",
    "gpt-4o",
  ],
  "gpt-mini": [
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-4o-mini",
  ],
  "qwen-coder": [
    "qwen3-coder-next",
    "qwen3-coder-plus",
    "qwen2.5-coder-32b-instruct",
  ],
  "qwen-max": [
    "qwen3.8-max-preview",
    "qwen3.7-max",
    "qwen3.5-plus",
  ],
  "glm-flagship": [
    "glm-5.2",
    "glm-5.1",
    "glm-5",
    "glm-4.7",
  ],
  "kimi-flagship": [
    "kimi-k2.6",
    "kimi-k2.5",
    "kimi-k2",
  ],
};

/**
 * Virtual models mapped to family identifiers
 */
export const VIRTUAL_MODEL_FAMILIES = {
  "gemini-current-flash": "gemini-flash",
  "gemini-current-pro": "gemini-pro",
  "claude-current-sonnet": "claude-sonnet",
  "claude-current-opus": "claude-opus",
  "claude-current-haiku": "claude-haiku",
  "gpt-current": "gpt-flagship",
  "gpt-current-mini": "gpt-mini",
  "qwen-current-coder": "qwen-coder",
  "qwen-current-max": "qwen-max",
  "glm-current": "glm-flagship",
  "kimi-current": "kimi-flagship",
};

/**
 * Check if a model identifier is a virtual model
 */
export function isVirtualModel(modelStr) {
  if (!modelStr || typeof modelStr !== "string") return false;
  const clean = modelStr.includes("/") ? modelStr.slice(modelStr.indexOf("/") + 1) : modelStr;
  return !!VIRTUAL_MODEL_FAMILIES[clean];
}

/**
 * Find the fallback chain for a given model or virtual model.
 * If model is a virtual model (e.g. "gemini-current-flash"), returns the entire family chain.
 * If model is a concrete model (e.g. "gemini-3.8-flash"), returns the slice starting at that model,
 * or matching family fallback order.
 */
export function getModelFallbackChain(modelStr, provider = null) {
  if (!modelStr || typeof modelStr !== "string") return [];
  const clean = modelStr.includes("/") ? modelStr.slice(modelStr.indexOf("/") + 1) : modelStr;

  // 1. Virtual model direct match
  if (VIRTUAL_MODEL_FAMILIES[clean]) {
    const familyKey = VIRTUAL_MODEL_FAMILIES[clean];
    return [...(MODEL_FAMILIES[familyKey] || [])];
  }

  // 2. Find which family contains this model
  for (const [, chain] of Object.entries(MODEL_FAMILIES)) {
    const index = chain.indexOf(clean);
    if (index !== -1) {
      // Return degradation chain starting from requested model
      return chain.slice(index);
    }
  }

  // 3. Fallback: single model if no family matched
  return [clean];
}

// In-memory model cooldown cache: key -> timestamp (ms)
// Key format: `${provider}:${model}`
const modelCooldownCache = new Map();

// Default 1h cooldown (3,600,000 ms)
export const DEFAULT_MODEL_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Check if a specific model under a provider is in cooldown
 */
export function isModelInCooldown(provider, model) {
  if (!provider || !model) return false;
  const key = `${provider}:${model}`;
  const expiry = modelCooldownCache.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    modelCooldownCache.delete(key);
    return false;
  }
  return true;
}

/**
 * Get remaining cooldown in ms for a provider + model
 */
export function getModelCooldownRemaining(provider, model) {
  if (!provider || !model) return 0;
  const key = `${provider}:${model}`;
  const expiry = modelCooldownCache.get(key);
  if (!expiry) return 0;
  const rem = expiry - Date.now();
  if (rem <= 0) {
    modelCooldownCache.delete(key);
    return 0;
  }
  return rem;
}

/**
 * Put a model in cooldown for a provider (e.g., all accounts lacked the model)
 */
export function markModelInCooldown(provider, model, cooldownMs = DEFAULT_MODEL_COOLDOWN_MS) {
  if (!provider || !model) return;
  const key = `${provider}:${model}`;
  const expiry = Date.now() + cooldownMs;
  modelCooldownCache.set(key, expiry);
}

/**
 * Clear cooldown for a specific provider + model or all models
 */
export function clearModelCooldown(provider = null, model = null) {
  if (!provider && !model) {
    modelCooldownCache.clear();
    return;
  }
  if (provider && model) {
    modelCooldownCache.delete(`${provider}:${model}`);
    return;
  }
  if (provider) {
    for (const key of modelCooldownCache.keys()) {
      if (key.startsWith(`${provider}:`)) {
        modelCooldownCache.delete(key);
      }
    }
  }
}

/**
 * Get snapshot of all active model cooldowns
 */
export function getAllActiveModelCooldowns() {
  const now = Date.now();
  const out = [];
  for (const [key, expiry] of modelCooldownCache.entries()) {
    if (expiry > now) {
      const [provider, ...rest] = key.split(":");
      const model = rest.join(":");
      out.push({
        provider,
        model,
        cooldownUntil: new Date(expiry).toISOString(),
        remainingMs: expiry - now,
      });
    } else {
      modelCooldownCache.delete(key);
    }
  }
  return out;
}
