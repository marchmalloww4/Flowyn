import { customType } from "drizzle-orm/pg-core";
import { getEmbeddingConfig } from "@/lib/embeddings/config";

function validateVector(value: number[]): void {
  const dimension = getEmbeddingConfig().dimension;
  if (value.length !== dimension) throw new Error(`Embedding vector must contain ${dimension} values.`);
  if (value.some((item) => !Number.isFinite(item))) throw new Error("Embedding vector values must be finite numbers.");
}

function parseVector(value: string): number[] {
  const parsed = value.replace(/^\[|\]$/g, "").split(",").filter(Boolean).map(Number);
  validateVector(parsed);
  return parsed;
}

export const embeddingVector = customType<{ data: number[]; driverData: string }>({
  dataType: () => `vector(${getEmbeddingConfig().dimension})`,
  toDriver: (value) => {
    validateVector(value);
    return `[${value.join(",")}]`;
  },
  fromDriver: (value) => parseVector(value),
});
