import { describe, expect, it } from "vitest";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

describe("account fallback classification", () => {
  it("does not retry another account for a provider 400 by default", () => {
    expect(checkFallbackError(400, "Request contains an invalid argument.")).toMatchObject({
      shouldFallback: false,
      cooldownMs: 0,
    });
  });

  it("still retries a quota error even when the provider status is 400", () => {
    expect(checkFallbackError(400, "quota exceeded").shouldFallback).toBe(true);
  });
});
