import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { listWorkflowWebhookEvents } from "@/lib/webhooks/service";
import { webhookHistoryQuerySchema } from "@/lib/webhooks/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    const value = new URL(request.url).searchParams.get("limit");
    const input = webhookHistoryQuerySchema.parse({ limit: value ?? undefined });
    return NextResponse.json({ events: await listWorkflowWebhookEvents(user.id, id, input.limit) });
  } catch (error) {
    return errorResponse(error);
  }
}
