import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { runAgent } from "@/lib/agents/runner";
import { agentRunSchema } from "@/lib/agents/validation";
import { errorResponse, readJson } from "@/lib/http";
import { AppError } from "@/lib/security/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    const input = await readJson(request, agentRunSchema);
    return NextResponse.json({ run: await runAgent({ userId: currentUser.id, agentId: id, goal: input.goal, abortSignal: request.signal }) });
  } catch (error) {
    if (error instanceof AppError && typeof (error as AppError & { runId?: unknown }).runId === "string") {
      const runId = (error as AppError & { runId: string }).runId;
      return NextResponse.json({ error: { code: error.code, message: error.message }, runId }, { status: error.status });
    }
    return errorResponse(error);
  }
}
