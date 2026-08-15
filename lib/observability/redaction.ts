const sensitiveKey = /(password|token|secret|credential|api[-_]?key|access[-_]?token|refresh[-_]?token|authorization|cookie|prompt|response|body|signature|provider[-_]?payload|private[-_]?knowledge|url|uri|dsn|connection[-_]?string|headers?)/iu;
const MAX_DEPTH = 5;
const MAX_ARRAY_LENGTH = 100;
const MAX_STRING_LENGTH = 1000;

export function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_LENGTH).map((item) => redactLogValue(item, depth + 1));
  if (typeof value !== "object") return "[omitted]";
  return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitiveKey.test(key)).map(([key, nested]) => [key, redactLogValue(nested, depth + 1)]));
}

export function safeErrorSummary(error: unknown): { name: string } {
  return { name: error instanceof Error ? error.name : "UnknownError" };
}
