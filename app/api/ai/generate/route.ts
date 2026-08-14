import { NextResponse } from "next/server";
import { AIError, GenerationFailedError } from "@/lib/ai/errors";
import { generateText, prepareGeneration, streamText } from "@/lib/ai/service";
import { aiGenerationRequestSchema } from "@/lib/ai/validation";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { randomUUID } from "node:crypto";
import { directAiOperationKey } from "@/lib/usage/policy";
import { getOrCreateCorrelationId, runWithCorrelationId } from "@/lib/observability/correlation";
import { AppError } from "@/lib/security/errors";

function aiErrorResponse(error: unknown): NextResponse {
  const normalized = error instanceof AIError ? error : new GenerationFailedError();
  return NextResponse.json({ error: { code: normalized.code, message: normalized.message } }, { status: normalized.status });
}

function event(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  const correlationId = getOrCreateCorrelationId(request.headers);
  return runWithCorrelationId(correlationId, async () => {
    try {
      const currentUser = await requireUser(request.headers);
      const input = await readJson(request, aiGenerationRequestSchema);
      const rawIdempotencyKey = request.headers.get("idempotency-key")?.trim();
      if (rawIdempotencyKey && !/^[A-Za-z0-9._~-]{1,120}$/u.test(rawIdempotencyKey)) throw new AppError("INVALID_REQUEST", 400, "The Idempotency-Key header is invalid.");
      const requestId = rawIdempotencyKey ?? randomUUID();
      const prepared = await prepareGeneration({ ...input, userId: currentUser.id, usage: { operationKey: directAiOperationKey(requestId), sourceType: "DIRECT_AI", sourceId: requestId, correlationId } });
      if (!input.stream) return NextResponse.json({ result: await generateText(prepared) });

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of streamText(prepared)) controller.enqueue(event(chunk));
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          } catch (error) {
            const normalized = error instanceof AIError ? error : new GenerationFailedError();
            controller.enqueue(event({ error: { code: normalized.code, message: normalized.message } }));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
    } catch (error) {
      if (error instanceof AIError) return aiErrorResponse(error);
      return errorResponse(error);
    }
  });
}
