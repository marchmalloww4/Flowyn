import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { decideWorkflowApproval } from "@/lib/workflows/approval-service";
import { workflowApprovalDecisionSchema } from "@/lib/workflows/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    const input = await readJson(request, workflowApprovalDecisionSchema);
    return NextResponse.json({ approval: await decideWorkflowApproval(user.id, id, "rejected", input.reason ?? null) });
  } catch (error) {
    return errorResponse(error);
  }
}
