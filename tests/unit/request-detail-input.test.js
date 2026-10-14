import { describe, expect, it } from "vitest";
import { extractRequestConfig } from "../../open-sse/handlers/chatCore/requestDetail.js";

describe("request detail input", () => {
  it("keeps the raw client body instead of the normalized provider body", () => {
    const raw = {
      model: "batista-high",
      stream: false,
      messages: [{ role: "user", content: "hello" }],
      custom_client_field: { enabled: true },
    };
    const normalized = {
      model: "antigravity/gemini-3.7-flash-high",
      messages: [{ role: "user", content: "translated" }],
      reasoning_effort: "high",
    };

    expect(extractRequestConfig(normalized, true, { body: raw })).toEqual(raw);
  });
});
