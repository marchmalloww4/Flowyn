import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { runAgent } from "@/lib/agents/runner";
import { agentRunSchema } from "@/lib/agents/validation";
import { errorResponse, readJson } from "@/lib/http";
import { AppError } from "@/lib/security/errors";
import { randomUUID } from "node:crypto";
import { agentRunOperationKey } from "@/lib/usage/policy";
import { getOrCreateCorrelationId, runWithCorrelationId } from "@/lib/observability/correlation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const correlationId = getOrCreateCorrelationId(request.headers);
  return runWithCorrelationId(correlationId, async () => {
    try {
      const currentUser = await requireUser(request.headers);
      const { id } = await context.params;
      const input = await readJson(request, agentRunSchema);
      const rawIdempotencyKey = request.headers.get("idempotency-key")?.trim();
      if (rawIdempotencyKey && !/^[A-Za-z0-9._~-]{1,120}$/u.test(rawIdempotencyKey)) throw new AppError("INVALID_REQUEST", 400, "The Idempotency-Key header is invalid.");
      const requestId = rawIdempotencyKey ?? randomUUID();
      return NextResponse.json({ run: await runAgent({ userId: currentUser.id, agentId: id, goal: input.goal, abortSignal: request.signal, idempotencyKey: requestId, usage: { operationKey: agentRunOperationKey(requestId), sourceType: "AGENT_RUN", sourceId: requestId, correlationId } }) });
    } catch (error) {
      if (error instanceof AppError && typeof (error as AppError & { runId?: unknown }).runId === "string") {
        const runId = (error as AppError & { runId: string }).runId;
        return NextResponse.json({ error: { code: error.code, message: error.message }, runId }, { status: error.status });
      }
      return errorResponse(error);
    }
  });
}
