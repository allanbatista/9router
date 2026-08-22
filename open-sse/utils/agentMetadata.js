const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 256;
const SAFE_KEY_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Sanitizes a metadata key to be safe for MongoDB queries and subdocuments.
 * Strips leading '$', replaces dots with underscores, and checks alphanumeric/hyphen/underscore.
 *
 * @param {any} rawKey
 * @returns {string|null}
 */
export function sanitizeMetadataKey(rawKey) {
  if (rawKey == null) return null;
  let key = String(rawKey).trim();
  // Strip leading '$' operators
  key = key.replace(/^\$+/, "");
  // Replace '.' with '_' to prevent unintended nested field traversal
  key = key.replace(/\./g, "_");

  if (!key || key.length > MAX_KEY_LENGTH) return null;
  if (!SAFE_KEY_REGEX.test(key)) return null;

  return key;
}

/**
 * Sanitizes a metadata value, allowing only scalar primitives (string, number, boolean)
 * and truncating long strings to MAX_VALUE_LENGTH characters.
 *
 * @param {any} rawValue
 * @returns {string|number|boolean|null}
 */
export function sanitizeMetadataValue(rawValue) {
  if (rawValue == null) return null;

  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? rawValue : null;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return trimmed.length > MAX_VALUE_LENGTH ? trimmed.slice(0, MAX_VALUE_LENGTH) : trimmed;
  }

  // Non-scalar types (objects, functions, symbols) are ignored
  return null;
}

/**
 * Normalizes agent metadata from either an array format [{ key, value }] or a flat object { key: value },
 * sanitizing all keys and values.
 *
 * @param {any} raw
 * @returns {Record<string, string|number|boolean>}
 */
export function normalizeAgentMetadata(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const result = {};

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;

      const rawKey = item.key ?? item.name ?? (Array.isArray(item) ? item[0] : null);
      const rawVal = item.value ?? item.val ?? (Array.isArray(item) ? item[1] : null);

      const safeKey = sanitizeMetadataKey(rawKey);
      const safeVal = sanitizeMetadataValue(rawVal);

      if (safeKey !== null && safeVal !== null) {
        result[safeKey] = safeVal;
      }
    }
  } else {
    for (const [k, v] of Object.entries(raw)) {
      const safeKey = sanitizeMetadataKey(k);
      const safeVal = sanitizeMetadataValue(v);

      if (safeKey !== null && safeVal !== null) {
        result[safeKey] = safeVal;
      }
    }
  }

  return result;
}
