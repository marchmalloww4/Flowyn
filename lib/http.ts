import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/security/errors";
import { logError } from "@/lib/observability/logger";
import { getCorrelationId } from "@/lib/observability/correlation";
import { metrics } from "@/lib/observability/metrics";

export async function readJson<T>(request: Request, schema: { parse(input: unknown): T }): Promise<T> {
  const body: unknown = await request.json();
  return schema.parse(body);
}

export function errorResponse(error: unknown): NextResponse {
  const result = toErrorResponse(error);
  if (result.body.error.code === "INTERNAL_ERROR") logError("http.unhandled_error", error);
  metrics.increment("flowyn_http_errors_total", { operation: result.body.error.code, status: String(result.status) });
  const response = NextResponse.json(result.body, { status: result.status });
  const correlationId = getCorrelationId();
  if (correlationId) response.headers.set("x-flowyn-correlation-id", correlationId);
  return response;
}
