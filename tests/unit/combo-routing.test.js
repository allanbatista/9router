import { describe, it, expect, beforeEach, vi } from "vitest";

const affinityMocks = vi.hoisted(() => ({
  getComboAffinity: vi.fn(),
  setComboAffinity: vi.fn(() => Promise.resolve()),
  touchComboAffinity: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/db/repos/comboAffinityRepo.js", () => affinityMocks);

import { getRotatedModels, handleComboChat, resetComboRotation } from "../../open-sse/services/combo.js";

describe("combo round-robin routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    affinityMocks.getComboAffinity.mockResolvedValue(null);
    resetComboRotation();
  });

  it("keeps existing one-request round-robin behavior by default", async () => {
    const models = ["provider/model-a", "provider/model-b"];

    const firstChoices = [];
    for (let i = 0; i < 4; i++) {
      const rotated = await getRotatedModels(models, "code-xhigh", "round-robin");
      firstChoices.push(rotated[0]);
    }

    expect(firstChoices).toEqual([
      "provider/model-a",
      "provider/model-b",
      "provider/model-a",
      "provider/model-b",
    ]);
  });

  it("sticks to each combo model for the configured number of requests", async () => {
    const models = ["provider/model-a", "provider/model-b"];

    const firstChoices = [];
    for (let i = 0; i < 6; i++) {
      const rotated = await getRotatedModels(models, "code-xhigh", "round-robin", 2);
      firstChoices.push(rotated[0]);
    }

    expect(firstChoices).toEqual([
      "provider/model-a",
      "provider/model-a",
      "provider/model-b",
      "provider/model-b",
      "provider/model-a",
      "provider/model-a",
    ]);
  });

  it("tracks sticky rotation independently per combo", async () => {
    const models = ["provider/model-a", "provider/model-b"];

    expect((await getRotatedModels(models, "code-high", "round-robin", 2))[0]).toBe("provider/model-a");
    expect((await getRotatedModels(models, "code-xhigh", "round-robin", 2))[0]).toBe("provider/model-a");
    expect((await getRotatedModels(models, "code-high", "round-robin", 2))[0]).toBe("provider/model-a");
    expect((await getRotatedModels(models, "code-high", "round-robin", 2))[0]).toBe("provider/model-b");
    expect((await getRotatedModels(models, "code-xhigh", "round-robin", 2))[0]).toBe("provider/model-a");
  });

  it("does not rotate fallback combos", async () => {
    const models = ["provider/model-a", "provider/model-b"];

    expect(await getRotatedModels(models, "code-xhigh", "fallback", 2)).toEqual(models);
    expect(await getRotatedModels(models, "code-xhigh", "fallback", 2)).toEqual(models);
  });

  it("moves affinity to the next model after a late stream failure", async () => {
    const models = ["provider/model-a", "provider/model-b"];
    affinityMocks.getComboAffinity.mockResolvedValue({ selectedModel: models[0] });
    let streamFailureContext;

    const response = await handleComboChat({
      body: { messages: [] },
      models,
      handleSingleModel: async (_body, _model, context) => {
        streamFailureContext = context;
        return new Response("ok");
      },
      log: { info: vi.fn(), warn: vi.fn() },
      comboName: "batista-simple",
      comboStrategy: "round-robin-affinity",
      cacheKeyHash: "cache-key-hash",
      rawKey: "session-1",
    });

    expect(response.ok).toBe(true);
    await streamFailureContext.onStreamFailure();
    expect(affinityMocks.setComboAffinity).toHaveBeenCalledWith(
      "batista-simple",
      "cache-key-hash",
      "session-1",
      models[1],
    );
  });
});
