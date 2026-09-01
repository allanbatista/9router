import { describe, expect, it } from "vitest";
import {
  parseModelEffort,
  formatModelWithEffort,
  normalizeComboDefaultEffort,
  COMBO_DEFAULT_EFFORT_OPTIONS,
} from "../../src/shared/constants/combo.js";

describe("combo per-model effort helpers", () => {
  it("parses model effort correctly", () => {
    expect(parseModelEffort("openai/gpt-4o")).toEqual({ baseModel: "openai/gpt-4o", effort: "" });
    expect(parseModelEffort("openai/gpt-4o(high)")).toEqual({ baseModel: "openai/gpt-4o", effort: "high" });
    expect(parseModelEffort("claude-opus-4.7(max)")).toEqual({ baseModel: "claude-opus-4.7", effort: "max" });
    expect(parseModelEffort("")).toEqual({ baseModel: "", effort: "" });
  });

  it("formats model with effort correctly", () => {
    expect(formatModelWithEffort("openai/gpt-4o", "high")).toBe("openai/gpt-4o(high)");
    expect(formatModelWithEffort("openai/gpt-4o(low)", "high")).toBe("openai/gpt-4o(high)");
    expect(formatModelWithEffort("openai/gpt-4o(high)", "")).toBe("openai/gpt-4o");
    expect(formatModelWithEffort("openai/gpt-4o", "")).toBe("openai/gpt-4o");
  });

  it("normalizes combo default effort correctly", () => {
    expect(normalizeComboDefaultEffort("high")).toBe("high");
    expect(normalizeComboDefaultEffort(" HIGH ")).toBe("high");
    expect(normalizeComboDefaultEffort(null)).toBeNull();
    expect(normalizeComboDefaultEffort("")).toBeNull();
    expect(normalizeComboDefaultEffort("invalid-level")).toBeUndefined();
  });
});
