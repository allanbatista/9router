import { describe, expect, it } from "vitest";
import { getCachedTokens, getCacheCreationTokens, getPromptTokens } from "@/shared/utils/usageTokens.js";

describe("usage token normalization", () => {
  it("uses nested cache usage in dashboard aggregates and pricing", () => {
    const tokens = {
      prompt_tokens: 100,
      prompt_tokens_details: { cached_tokens: 80, cache_creation_tokens: 30 },
    };

    expect(getCachedTokens(tokens)).toBe(80);
    expect(getCacheCreationTokens(tokens)).toBe(30);
    expect(getPromptTokens(tokens)).toBe(110);
  });
});
