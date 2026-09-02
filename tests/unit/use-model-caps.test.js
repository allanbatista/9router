import { describe, expect, it } from "vitest";

import { resolveCaps } from "../../src/shared/utils/modelCaps.js";

describe("useModelCaps", () => {
  it("resolves fallback capabilities using the provider from the full model id", () => {
    expect(resolveCaps({}, {}, "antigravity/gemini-3.8-flash-high")).toMatchObject({
      vision: true,
      reasoning: true,
      search: true,
      contextWindow: 1048576,
      maxOutput: 65536,
    });
  });

  it("resolves bare model ids without throwing", () => {
    expect(() => resolveCaps({}, {}, "gemini-3.8-flash-high")).not.toThrow();
  });
});
