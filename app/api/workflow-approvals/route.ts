import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { listWorkflowApprovalRequests } from "@/lib/workflows/approval-service";
import { workflowApprovalListQuerySchema } from "@/lib/workflows/validation";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const input = workflowApprovalListQuerySchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
    return NextResponse.json({ approvals: await listWorkflowApprovalRequests(user.id, input.workspaceId) });
  } catch (error) {
    return errorResponse(error);
  }
}
