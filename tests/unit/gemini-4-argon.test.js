import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { getModelUpstreamId, isValidModel } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { MODEL_PRICING } from "../../open-sse/providers/pricing.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { MITM_TOOLS } from "../../src/shared/constants/cliTools.js";
import { parseModel } from "../../open-sse/services/model.js";

const mitm = createRequire(import.meta.url)("../../src/mitm/config.js");
const model = "gemini-4-argon";

describe("Gemini 4 Argon", () => {
  it.each(["gemini", "ag", "openrouter"])("routes the official model ID through %s", (provider) => {
    const id = provider === "openrouter" ? `google/${model}` : model;
    expect(isValidModel(provider, id)).toBe(true);
    expect(getModelUpstreamId(provider, `${id}(medium)`)).toBe(`${id}(medium)`);
    expect(getCapabilitiesForModel(provider, id)).toMatchObject({
      reasoning: true, vision: true, thinkingFormat: "gemini-level",
      thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536,
    });
    expect(getThinkingLevels(provider, id)).toEqual(["low", "medium", "high"]);
  });

  it("resolves both Antigravity provider names", () => {
    for (const provider of ["ag", "antigravity"]) {
      expect(parseModel(`${provider}/${model}`)).toMatchObject({ provider: "antigravity", model });
    }
  });

  it.each(["low", "medium", "high", "none", "off", "minimal", "xhigh", "max"])(
    "normalizes %s to a supported thinking level", (effort) => {
      for (const provider of ["gemini", "antigravity"]) {
        const body = provider === "gemini" ? { generationConfig: {} } : { request: { generationConfig: {} } };
        applyThinking(provider, model, body, provider, { mode: effort === "none" || effort === "off" ? "none" : "level", level: effort });
        const config = (body.request || body).generationConfig;
        const expected = ["none", "off", "minimal"].includes(effort) ? "low" : ["xhigh", "max"].includes(effort) ? "high" : effort;
        expect(config.thinkingConfig.thinkingLevel).toBe(expected);
        expect(config.maxOutputTokens).toBeGreaterThan(0);
      }
    }
  );

  it("uses the upstream default when no thinking intent is supplied", () => {
    const body = { generationConfig: {} };
    applyThinking("gemini", model, body, "gemini");
    expect(body).toEqual({ generationConfig: {} });
  });

  it("preserves Gemini 3 minimal thinking", () => {
    const body = { generationConfig: {} };
    applyThinking("gemini", "gemini-3.7-flash", body, "gemini", { mode: "none" });
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("minimal");
  });

  it("uses OpenAI reasoning effort through OpenRouter", () => {
    const body = {};
    applyThinking("openai", `google/${model}`, body, "openrouter", { mode: "level", level: "medium" });
    expect(body).toEqual({ reasoning_effort: "medium" });
  });

  it("exposes the MITM slot without routing it as a previous model", () => {
    expect(MITM_TOOLS.antigravity.modelAliases).toContain(model);
    expect(mitm.MODEL_SYNONYMS.antigravity[model]).toBe(model);
    expect(mitm.extractModel("/v1internal:streamGenerateContent", Buffer.from(JSON.stringify({ model })))).toBe(model);
  });

  it("accounts for introductory input, output, cached and thinking prices", () => {
    expect(MODEL_PRICING[model]).toEqual({ input: 2, output: 10, cached: 0.1, reasoning: 10 });
  });
});
