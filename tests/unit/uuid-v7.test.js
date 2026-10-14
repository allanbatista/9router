import { describe, expect, it } from "vitest";
import { uuidv7 } from "../../open-sse/utils/uuid.js";

describe("uuidv7", () => {
  it("generates a UUIDv7-shaped identifier", () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
