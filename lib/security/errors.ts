import { z } from "zod";
import { EmbeddingError } from "@/lib/embeddings/errors";

export class AppError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "AppError";
  }
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
  console.error("Unhandled request error", error);
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } } };
}
