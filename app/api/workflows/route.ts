import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { createWorkflow, listWorkflows } from "@/lib/workflows/service";
import { workflowCreateSchema, workflowListQuerySchema } from "@/lib/workflows/validation";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const input = workflowListQuerySchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
    return NextResponse.json({ workflows: await listWorkflows(user.id, input.workspaceId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const input = await readJson(request, workflowCreateSchema);
    return NextResponse.json({ workflow: await createWorkflow(user.id, input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
