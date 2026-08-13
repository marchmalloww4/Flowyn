export type KnowledgeMetadataValue = string | number | boolean | null;
export type KnowledgeMetadata = Record<string, KnowledgeMetadataValue>;

const MAX_KEYS = 32;
const MAX_KEY_LENGTH = 80;
const MAX_STRING_LENGTH = 500;
const SECRET_KEY_PATTERN = /(password|token|secret|apikey|api_key|credential|private[_-]?key)/i;

function isScalar(value: unknown): value is KnowledgeMetadataValue {
  return value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= MAX_STRING_LENGTH);
}

export function sanitizeMetadata(input: unknown): KnowledgeMetadata {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  const output: KnowledgeMetadata = {};
  for (const [key, value] of Object.entries(input).slice(0, MAX_KEYS)) {
    if (!key.trim() || key.length > MAX_KEY_LENGTH || SECRET_KEY_PATTERN.test(key) || !isScalar(value)) continue;
    output[key] = value;
  }
  return output;
}
