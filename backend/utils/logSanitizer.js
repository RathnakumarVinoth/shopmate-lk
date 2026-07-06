const SENSITIVE_KEY_PATTERN =
  /(password|passwd|pwd|token|authorization|cookie|secret|jwt|api[_-]?key|access[_-]?key|refresh[_-]?key|session)/i;

const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 25;
const MAX_OBJECT_KEYS = 60;
const MAX_STRING_LENGTH = 1000;
const MAX_SERIALIZED_LENGTH = 12000;

const redactText = (value) => {
  const text = String(value ?? "");

  return text
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(
      /((?:password|passwd|pwd|token|authorization|secret|jwt[_-]?secret|api[_-]?key)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[REDACTED]"
    );
};

const sanitizeString = (value) => {
  const redacted = redactText(value);
  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`
    : redacted;
};

const sanitizeForLogging = (value, depth = 0, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (typeof value !== "object") {
    return sanitizeString(value);
  }

  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeForLogging(item, depth + 1, seen));
  }

  const sanitized = {};
  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);

  for (const [key, item] of entries) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[REDACTED]"
      : sanitizeForLogging(item, depth + 1, seen);
  }

  return sanitized;
};

const getSafeRequestPath = (req) => {
  const path = req.originalUrl || req.url || req.path || "/";

  return sanitizeString(
    String(path)
      .split("?")[0]
      .replace(/\/[A-Za-z0-9_-]{32,}(?=\/|$)/g, "/[REDACTED]")
  ).slice(0, 500);
};

const getSafeHeaders = (headers = {}) => {
  const allowedHeaderNames = [
    "accept",
    "content-type",
    "user-agent",
    "x-forwarded-for",
    "x-request-id",
  ];
  const safeHeaders = {};

  for (const name of allowedHeaderNames) {
    if (headers[name] !== undefined) {
      safeHeaders[name] = sanitizeForLogging(headers[name]);
    }
  }

  return safeHeaders;
};

const serializeSanitizedRequest = (req) => {
  const payload = sanitizeForLogging({
    params: req.params || {},
    query: req.query || {},
    body: req.body || {},
    headers: getSafeHeaders(req.headers),
  });
  const serialized = JSON.stringify(payload);

  return serialized.length > MAX_SERIALIZED_LENGTH
    ? `${serialized.slice(0, MAX_SERIALIZED_LENGTH)}...[TRUNCATED]`
    : serialized;
};

module.exports = {
  getSafeRequestPath,
  redactText,
  sanitizeForLogging,
  serializeSanitizedRequest,
};
