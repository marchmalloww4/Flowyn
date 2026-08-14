import { z } from "zod";
import { EmbeddingError } from "@/lib/embeddings/errors";

export class AppError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export type FailureCategory = "VALIDATION" | "AUTHENTICATION" | "AUTHORIZATION" | "RATE_LIMIT" | "QUOTA" | "CONCURRENCY" | "PROVIDER" | "INFRASTRUCTURE" | "TIMEOUT" | "AMBIGUOUS_EXTERNAL_SIDE_EFFECT" | "INTERNAL";

export function getFailureCategory(error: unknown): FailureCategory {
  if (error instanceof z.ZodError) return "VALIDATION";
  if (!(error instanceof AppError)) return "INTERNAL";
  const code = error.code.toUpperCase();
  if (code.includes("AMBIGUOUS")) return "AMBIGUOUS_EXTERNAL_SIDE_EFFECT";
  if (code.includes("AUTH") || code === "UNAUTHENTICATED" || code.includes("PRINCIPAL")) return code.includes("UNAUTHENTICATED") ? "AUTHENTICATION" : "AUTHORIZATION";
  if (code.includes("RATE_LIMIT") || code.includes("RATE_LIMITED")) return "RATE_LIMIT";
  if (code.includes("QUOTA")) return "QUOTA";
  if (code.includes("CONCURRENCY")) return "CONCURRENCY";
  if (code.includes("TIMEOUT")) return "TIMEOUT";
  if (code.includes("PROVIDER") || code.includes("MODEL") || code.includes("EMBEDDING")) return "PROVIDER";
  if (code.includes("UNAVAILABLE") || code.includes("ADMISSION") || code.includes("INFRASTRUCTURE")) return "INFRASTRUCTURE";
  if (code.includes("INVALID") || code.includes("VALIDATION")) return "VALIDATION";
  return error.status >= 500 ? "INTERNAL" : "AUTHORIZATION";
}

export function toErrorResponse(error: unknown): { status: number; body: { error: { code: string; message: string; fields?: Record<string, string[]> } } } {
  if (error instanceof z.ZodError) {
    const fields = Object.fromEntries(Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1])));
    return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "The request could not be validated.", fields } } };
  }
  if (error instanceof AppError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  if (error instanceof EmbeddingError) {
    const messages: Record<EmbeddingError["code"], string> = {
      PROVIDER_UNAVAILABLE: "The embedding provider is unavailable.",
      MODEL_UNAVAILABLE: "The configured embedding model is unavailable.",
      REQUEST_TIMEOUT: "The embedding request timed out.",
      INVALID_REQUEST: "The embedding request is invalid.",
      MALFORMED_RESPONSE: "The embedding provider returned an invalid response.",
      DIMENSION_MISMATCH: "The embedding provider returned an incompatible vector.",
      EMBEDDING_FAILED: "The embedding request failed.",
    };
    const status = error.code === "INVALID_REQUEST" ? 400 : ["PROVIDER_UNAVAILABLE", "MODEL_UNAVAILABLE", "REQUEST_TIMEOUT"].includes(error.code) ? 503 : 502;
    return { status, body: { error: { code: error.code, message: messages[error.code] } } };
  }
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } } };
}
