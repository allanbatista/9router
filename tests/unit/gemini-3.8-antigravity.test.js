import { describe, expect, it } from "vitest";

import antigravity from "../../open-sse/providers/registry/antigravity.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { MODEL_PRICING } from "../../open-sse/providers/pricing.js";

describe("Gemini 3.8 Flash on Antigravity", () => {
  it("registers all tiered aliases with their upstream model ids", () => {
    const models = Object.fromEntries(antigravity.models.map((model) => [model.id, model]));

    for (const level of ["high", "medium", "low"]) {
      expect(models[`gemini-3.8-flash-${level}`]?.upstreamModelId)
        .toBe(`gemini-3.8-flash-tiered(${level})`);
    }
  });

  it("resolves capabilities and pricing", () => {
    const caps = getCapabilitiesForModel("antigravity", "gemini-3.8-flash-high");

    expect(caps).toMatchObject({ vision: true, reasoning: true, search: true });
    expect(MODEL_PRICING["gemini-3.8-flash-high"])
      .toEqual(MODEL_PRICING["gemini-3.7-flash-high"]);
  });
});
