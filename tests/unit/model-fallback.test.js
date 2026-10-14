import { describe, it, expect, beforeEach } from "bun:test";
import {
  MODEL_FAMILIES,
  VIRTUAL_MODEL_FAMILIES,
  isVirtualModel,
  getModelFallbackChain,
  isModelInCooldown,
  markModelInCooldown,
  clearModelCooldown,
  getAllActiveModelCooldowns,
  DEFAULT_MODEL_COOLDOWN_MS,
} from "../../open-sse/services/modelFallback.js";

describe("Model Fallback & Virtual Models", () => {
  beforeEach(() => {
    clearModelCooldown();
  });

  it("identifies virtual models accurately", () => {
    expect(isVirtualModel("gemini-current-flash")).toBe(true);
    expect(isVirtualModel("antigravity/gemini-current-flash")).toBe(true);
    expect(isVirtualModel("gemini-current-pro")).toBe(true);
    expect(isVirtualModel("claude-current-sonnet")).toBe(true);
    expect(isVirtualModel("gemini-3.8-flash")).toBe(false);
  });

  it("returns correct fallback chain for virtual models", () => {
    const geminiFlashChain = getModelFallbackChain("gemini-current-flash");
    expect(geminiFlashChain).toBeArray();
    expect(geminiFlashChain[0]).toBe("gemini-3.8-flash");
    expect(geminiFlashChain).toContain("gemini-3.7-flash");
    expect(geminiFlashChain).toContain("gemini-2.5-flash");

    const claudeSonnetChain = getModelFallbackChain("claude-current-sonnet");
    expect(claudeSonnetChain).toBeArray();
    expect(claudeSonnetChain[0]).toBe("claude-sonnet-4-6");
  });

  it("returns correct degradation chain starting from requested concrete model", () => {
    const chainFrom38 = getModelFallbackChain("gemini-3.8-flash");
    expect(chainFrom38[0]).toBe("gemini-3.8-flash");
    expect(chainFrom38).toContain("gemini-3.7-flash");

    const chainFrom37 = getModelFallbackChain("gemini-3.7-flash");
    expect(chainFrom37[0]).toBe("gemini-3.7-flash");
    expect(chainFrom37).not.toContain("gemini-3.8-flash");
  });

  it("manages 1-hour model cooldown cache", () => {
    expect(isModelInCooldown("antigravity", "gemini-3.8-flash")).toBe(false);

    markModelInCooldown("antigravity", "gemini-3.8-flash", DEFAULT_MODEL_COOLDOWN_MS);
    expect(isModelInCooldown("antigravity", "gemini-3.8-flash")).toBe(true);
    expect(isModelInCooldown("antigravity", "gemini-3.7-flash")).toBe(false);

    const cooldowns = getAllActiveModelCooldowns();
    expect(cooldowns.length).toBe(1);
    expect(cooldowns[0].provider).toBe("antigravity");
    expect(cooldowns[0].model).toBe("gemini-3.8-flash");

    clearModelCooldown("antigravity", "gemini-3.8-flash");
    expect(isModelInCooldown("antigravity", "gemini-3.8-flash")).toBe(false);
  });

  it("supports clearing all cooldowns", () => {
    markModelInCooldown("antigravity", "gemini-3.8-flash", 60000);
    markModelInCooldown("anthropic", "claude-sonnet-4-6", 60000);
    expect(getAllActiveModelCooldowns().length).toBe(2);

    clearModelCooldown();
    expect(getAllActiveModelCooldowns().length).toBe(0);
  });
});
