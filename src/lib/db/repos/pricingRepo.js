import { getConnection } from "../connection.js";
import { KvEntry } from "../models/KvEntry.js";
import { makeKv } from "../helpers/kvStore.js";

const pricingKv = makeKv("pricing");
const CACHE_TTL_MS = 5000;

let cache = { value: null, expiresAt: 0 };

function invalidate() {
  cache = { value: null, expiresAt: 0 };
}

async function getUserPricing() {
  return await pricingKv.getAll();
}

export async function getPricing() {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now) return cache.value;

  const userPricing = await getUserPricing();
  const { PROVIDER_PRICING } = await import("open-sse/providers/pricing.js");
  const merged = {};

  for (const [provider, models] of Object.entries(PROVIDER_PRICING)) {
    merged[provider] = { ...models };
    if (userPricing[provider]) {
      for (const [model, pricing] of Object.entries(userPricing[provider])) {
        merged[provider][model] = merged[provider][model]
          ? { ...merged[provider][model], ...pricing }
          : pricing;
      }
    }
  }

  for (const [provider, models] of Object.entries(userPricing)) {
    if (!merged[provider]) {
      merged[provider] = { ...models };
    } else {
      for (const [model, pricing] of Object.entries(models)) {
        if (!merged[provider][model]) merged[provider][model] = pricing;
      }
    }
  }

  cache = { value: merged, expiresAt: now + CACHE_TTL_MS };
  return merged;
}

export async function getPricingForModel(provider, model) {
  if (!model) return null;
  const userPricing = await getUserPricing();
  if (provider && userPricing[provider]?.[model]) return userPricing[provider][model];
  const { getPricingForModel: resolveConst } = await import("open-sse/providers/pricing.js");
  return resolveConst(provider, model);
}

// Atomic per-provider update/merge
export async function updatePricing(pricingData) {
  if (!pricingData || typeof pricingData !== "object") return await getUserPricing();
  await getConnection();

  for (const [provider, models] of Object.entries(pricingData)) {
    const existing = await KvEntry.findOne({ scope: "pricing", key: provider }).lean();
    const current = existing?.value && typeof existing.value === "object" ? { ...existing.value } : {};
    const merged = { ...current };
    for (const [model, pricing] of Object.entries(models || {})) {
      merged[model] = pricing;
    }
    await KvEntry.findOneAndUpdate(
      { scope: "pricing", key: provider },
      { $set: { value: merged, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  invalidate();
  return await getUserPricing();
}

export async function resetPricing(provider, model) {
  if (!provider) return await getUserPricing();
  await getConnection();

  if (!model) {
    await KvEntry.deleteOne({ scope: "pricing", key: provider });
  } else {
    const existing = await KvEntry.findOne({ scope: "pricing", key: provider }).lean();
    const current = existing?.value && typeof existing.value === "object" ? { ...existing.value } : {};
    delete current[model];
    if (Object.keys(current).length === 0) {
      await KvEntry.deleteOne({ scope: "pricing", key: provider });
    } else {
      await KvEntry.findOneAndUpdate(
        { scope: "pricing", key: provider },
        { $set: { value: current, updatedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  invalidate();
  return await getUserPricing();
}

export async function resetAllPricing() {
  await pricingKv.clear();
  invalidate();
  return {};
}
