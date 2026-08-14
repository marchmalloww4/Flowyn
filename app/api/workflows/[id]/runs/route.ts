import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { createWorkflowRun } from "@/lib/workflows/service";
import { workflowIdempotencyKeySchema, workflowRunSchema } from "@/lib/workflows/validation";
import { getOrCreateCorrelationId, runWithCorrelationId } from "@/lib/observability/correlation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const correlationId = getOrCreateCorrelationId(request.headers);
  return runWithCorrelationId(correlationId, async () => {
    try {
      const user = await requireUser(request.headers);
      const { id } = await context.params;
      const body = await readJson(request, workflowRunSchema);
      const header = request.headers.get("idempotency-key");
      const idempotencyKey = header === null ? undefined : workflowIdempotencyKeySchema.parse(header);
      return NextResponse.json({ run: await createWorkflowRun(user.id, id, body.input, idempotencyKey) }, { status: 202 });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
