import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getQueueConnection } from "@/lib/queue/connection";
import { errorResponse } from "@/lib/http";
import { AppError } from "@/lib/security/errors";
import { ingestWebhookDelivery } from "@/lib/webhooks/ingress";

type RouteContext = { params: Promise<{ publicId: string }> };

function rejectOversizedBody(): AppError {
  return new AppError("WEBHOOK_REJECTED", 401, "Webhook request could not be accepted.");
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { publicId } = await context.params;
    const maxBodyBytes = getEnv().WEBHOOK_MAX_BODY_BYTES;
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && (!/^[0-9]+$/.test(contentLength) || Number(contentLength) > maxBodyBytes)) throw rejectOversizedBody();
    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength > maxBodyBytes) throw rejectOversizedBody();
    const result = await ingestWebhookDelivery({
      publicId,
      timestamp: request.headers.get("x-flowyn-timestamp") ?? "",
      signature: request.headers.get("x-flowyn-signature") ?? "",
      eventId: request.headers.get("x-flowyn-event-id"),
      contentType: request.headers.get("content-type") ?? "",
      rawBody,
      redis: getQueueConnection(),
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
