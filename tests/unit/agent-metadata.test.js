import { describe, expect, it } from "vitest";
import {
  sanitizeMetadataKey,
  sanitizeMetadataValue,
  normalizeAgentMetadata,
} from "../../open-sse/utils/agentMetadata.js";

describe("Agent Metadata Normalization & Sanitization", () => {
  describe("sanitizeMetadataKey", () => {
    it("accepts valid alphanumeric keys with hyphens and underscores", () => {
      expect(sanitizeMetadataKey("os")).toBe("os");
      expect(sanitizeMetadataKey("agent-name")).toBe("agent-name");
      expect(sanitizeMetadataKey("client_version_1")).toBe("client_version_1");
    });

    it("strips leading MongoDB dollar operators", () => {
      expect(sanitizeMetadataKey("$where")).toBe("where");
      expect(sanitizeMetadataKey("$$gt")).toBe("gt");
    });

    it("replaces dot separators with underscores", () => {
      expect(sanitizeMetadataKey("system.info.os")).toBe("system_info_os");
    });

    it("rejects keys with invalid characters or excessive length", () => {
      expect(sanitizeMetadataKey("invalid key with spaces")).toBe(null);
      expect(sanitizeMetadataKey("key!@#$%^&*()")).toBe(null);
      expect(sanitizeMetadataKey("a".repeat(70))).toBe(null);
      expect(sanitizeMetadataKey(null)).toBe(null);
      expect(sanitizeMetadataKey(undefined)).toBe(null);
      expect(sanitizeMetadataKey("")).toBe(null);
    });
  });

  describe("sanitizeMetadataValue", () => {
    it("accepts string, number, and boolean scalars", () => {
      expect(sanitizeMetadataValue("linux")).toBe("linux");
      expect(sanitizeMetadataValue(1234)).toBe(1234);
      expect(sanitizeMetadataValue(true)).toBe(true);
      expect(sanitizeMetadataValue(false)).toBe(false);
    });

    it("truncates strings longer than 256 characters", () => {
      const longStr = "a".repeat(300);
      const result = sanitizeMetadataValue(longStr);
      expect(result).toHaveLength(256);
      expect(result).toBe("a".repeat(256));
    });

    it("rejects non-scalars (objects, arrays, symbols, NaN)", () => {
      expect(sanitizeMetadataValue({ nested: "value" })).toBe(null);
      expect(sanitizeMetadataValue(["item1"])).toBe(null);
      expect(sanitizeMetadataValue(NaN)).toBe(null);
      expect(sanitizeMetadataValue(null)).toBe(null);
      expect(sanitizeMetadataValue(undefined)).toBe(null);
    });
  });

  describe("normalizeAgentMetadata", () => {
    it("normalizes array of key-value objects [{ key, value }]", () => {
      const input = [
        { key: "os", value: "linux" },
        { key: "hostname", value: "workstation-01" },
        { key: "agent-name", value: "pi" },
      ];
      const result = normalizeAgentMetadata(input);
      expect(result).toEqual({
        os: "linux",
        hostname: "workstation-01",
        "agent-name": "pi",
      });
    });

    it("normalizes flat object { key: value }", () => {
      const input = {
        os: "darwin",
        hostname: "macbook-pro",
        "agent-name": "claude",
        custom_num: 42,
      };
      const result = normalizeAgentMetadata(input);
      expect(result).toEqual({
        os: "darwin",
        hostname: "macbook-pro",
        "agent-name": "claude",
        custom_num: 42,
      });
    });

    it("tolerates alternate array formats [{ name, val }] or [key, val]", () => {
      const input = [
        { name: "os", val: "windows" },
        ["hostname", "win-box"],
      ];
      const result = normalizeAgentMetadata(input);
      expect(result).toEqual({
        os: "windows",
        hostname: "win-box",
      });
    });

    it("sanitizes malicious or malformed entries", () => {
      const input = [
        { key: "$where", value: "malicious" },
        { key: "nested.property", value: "clean" },
        { key: "bad object", value: { evil: true } },
        null,
        "not an object",
      ];
      const result = normalizeAgentMetadata(input);
      expect(result).toEqual({
        where: "malicious",
        nested_property: "clean",
      });
    });

    it("returns empty object for invalid or empty inputs", () => {
      expect(normalizeAgentMetadata(null)).toEqual({});
      expect(normalizeAgentMetadata(undefined)).toEqual({});
      expect(normalizeAgentMetadata("string")).toEqual({});
      expect(normalizeAgentMetadata([])).toEqual({});
    });
  });
});
