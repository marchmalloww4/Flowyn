import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { createWorkflowWebhook, listWorkflowWebhooks } from "@/lib/webhooks/service";
import { webhookCreateSchema, webhookListQuerySchema } from "@/lib/webhooks/validation";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const input = webhookListQuerySchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
    return NextResponse.json({ webhooks: await listWorkflowWebhooks(user.id, input.workspaceId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const input = await readJson(request, webhookCreateSchema);
    return NextResponse.json(await createWorkflowWebhook(user.id, input), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
