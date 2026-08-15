import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

export function aiIdempotencyOperationKeyHash(operationKey: string): string {
  return createHash("sha256").update(operationKey, "utf8").digest("hex");
}

export function aiIdempotencyRequestFingerprint(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(input)), "utf8").digest("hex");
}
