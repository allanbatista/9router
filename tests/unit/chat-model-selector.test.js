import { describe, it, expect } from "bun:test";
import { filterModelsAndCombos } from "../../src/app/(dashboard)/dashboard/chat/components/ModelSelectorDropdown.js";
import { VIRTUAL_MODEL_FAMILIES } from "../../open-sse/services/modelFallback.js";
import { getComboConfig, getModelInfo } from "../../src/sse/services/model.js";

describe("Chat Model Selection & Virtual Fallback Models", () => {
  it("includes virtual models in dropdown filter when empty query", () => {
    const { virtuals, combos, providers } = filterModelsAndCombos([], [], "");
    expect(virtuals.length).toBe(Object.keys(VIRTUAL_MODEL_FAMILIES).length);
    expect(virtuals.some((v) => v.id === "gemini-current-flash")).toBe(true);
    expect(virtuals.some((v) => v.id === "gemini-current-pro")).toBe(true);
    expect(virtuals.some((v) => v.id === "claude-current-sonnet")).toBe(true);
  });

  it("filters virtual models by query 'gemini-current-flash'", () => {
    const { virtuals } = filterModelsAndCombos([], [], "gemini-current-flash");
    expect(virtuals.length).toBe(1);
    expect(virtuals[0].id).toBe("gemini-current-flash");
  });

  it("filters virtual models by query 'current'", () => {
    const { virtuals } = filterModelsAndCombos([], [], "current");
    expect(virtuals.length).toBeGreaterThan(5);
  });

  it("resolves getComboConfig for virtual models into fallback chains", async () => {
    const combo = await getComboConfig("gemini-current-flash");
    expect(combo).not.toBeNull();
    expect(combo.name).toBe("gemini-current-flash");
    expect(combo.models).toBeArray();
    expect(combo.models[0]).toBe("gemini-3.8-flash");
    expect(combo.models).toContain("gemini-3.7-flash");
  });

  it("returns null provider for virtual model in getModelInfo to signal combo handling", async () => {
    const info = await getModelInfo("gemini-current-flash");
    expect(info.provider).toBeNull();
    expect(info.model).toBe("gemini-current-flash");
  });
});
