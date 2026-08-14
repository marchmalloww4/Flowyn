import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/security/errors";
import { logError } from "@/lib/observability/logger";

export async function readJson<T>(request: Request, schema: { parse(input: unknown): T }): Promise<T> {
  const body: unknown = await request.json();
  return schema.parse(body);
}

export function errorResponse(error: unknown): NextResponse {
  const result = toErrorResponse(error);
  if (result.body.error.code === "INTERNAL_ERROR") logError("http.unhandled_error", error);
  return NextResponse.json(result.body, { status: result.status });
}
