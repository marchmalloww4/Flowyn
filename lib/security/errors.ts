import { z } from "zod";

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
  console.error("Unhandled request error", error);
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } } };
}