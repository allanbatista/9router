import { describe, expect, it } from "vitest";
import { applyComboDefaultEffort } from "../../open-sse/services/combo.js";

describe("applyComboDefaultEffort", () => {
  it("does not override the request when the combo default is empty", () => {
    const body = { messages: [{ role: "user", content: "hello" }] };

    expect(applyComboDefaultEffort(body, null)).toBe(body);
    expect(applyComboDefaultEffort(body, "")).toBe(body);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("adds the combo default as reasoning_effort when no effort is explicit", () => {
    const body = { messages: [{ role: "user", content: "hello" }] };

    const result = applyComboDefaultEffort(body, " high ");

    expect(result).toEqual({ ...body, reasoning_effort: "high" });
    expect(body.reasoning_effort).toBeUndefined();
  });

  it.each([
    { reasoning_effort: "low" },
    { reasoning: { effort: "medium" } },
    { thinking: { type: "disabled" } },
  ])("preserves an explicit effort shape: %j", (explicit) => {
    const body = { messages: [{ role: "user", content: "hello" }], ...explicit };

    expect(applyComboDefaultEffort(body, "high")).toBe(body);
  });
});
