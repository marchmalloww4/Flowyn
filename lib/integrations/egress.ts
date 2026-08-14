import { getEnv } from "@/lib/env";
import { INTEGRATION_REQUEST_TIMEOUT_MS_MAX, INTEGRATION_RESPONSE_MAX_BYTES_MAX, INTEGRATION_REQUEST_MAX_BYTES_MAX } from "@/lib/integrations/policy";
import type { StaticEgressTarget } from "@/lib/integrations/types";

const TARGET_URL: Record<StaticEgressTarget, string> = { "slack.chat.post_message": "https://slack.com/api/chat.postMessage" };

export type IntegrationEgressErrorCode = "EGRESS_DISABLED" | "EGRESS_REQUEST_TOO_LARGE" | "EGRESS_RESPONSE_TOO_LARGE" | "EGRESS_INVALID_RESPONSE" | "EGRESS_TIMEOUT" | "EGRESS_CANCELLED" | "EGRESS_CANCELLED_AFTER_DISPATCH" | "EGRESS_CONNECTION_FAILED";

export class IntegrationEgressError extends Error {
  constructor(public readonly code: IntegrationEgressErrorCode) {
    super("The integration provider request could not be completed.");
    this.name = "IntegrationEgressError";
  }
}

export interface StaticEgressRequest {
  target: StaticEgressTarget;
  authorization: string;
  body: string;
  signal?: AbortSignal;
  enabled?: boolean;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  fetcher?: typeof fetch;
}

export interface StaticEgressResponse {
  status: number;
  body: string;
  providerRequestId: string | null;
  retryAfterSeconds: number | null;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new IntegrationEgressError("EGRESS_INVALID_RESPONSE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value ?? new Uint8Array();
      total += chunk.byteLength;
      if (total > maxBytes) throw new IntegrationEgressError("EGRESS_RESPONSE_TOO_LARGE");
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
}

export async function executeStaticEgress(request: StaticEgressRequest): Promise<StaticEgressResponse> {
  if (!(request.target in TARGET_URL)) throw new IntegrationEgressError("EGRESS_CONNECTION_FAILED");
  const env = getEnv();
  if (!(request.enabled ?? env.INTEGRATION_EGRESS_ENABLED)) throw new IntegrationEgressError("EGRESS_DISABLED");
  const maxRequestBytes = Math.min(request.maxRequestBytes ?? env.INTEGRATION_MAX_REQUEST_BYTES, INTEGRATION_REQUEST_MAX_BYTES_MAX);
  const maxResponseBytes = Math.min(request.maxResponseBytes ?? env.INTEGRATION_MAX_RESPONSE_BYTES, INTEGRATION_RESPONSE_MAX_BYTES_MAX);
  if (new TextEncoder().encode(request.body).byteLength > maxRequestBytes) throw new IntegrationEgressError("EGRESS_REQUEST_TOO_LARGE");
  if (!request.authorization || /[\u0000-\u001F\u007F]/u.test(request.authorization)) throw new IntegrationEgressError("EGRESS_CONNECTION_FAILED");
  const timeoutMs = Math.min(request.timeoutMs ?? env.INTEGRATION_REQUEST_TIMEOUT_MS, INTEGRATION_REQUEST_TIMEOUT_MS_MAX);
  if (request.signal?.aborted) throw new IntegrationEgressError("EGRESS_CANCELLED");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (request.signal?.aborted) controller.abort();
  else request.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let requestStarted = false;
  try {
    requestStarted = true;
    const response = await (request.fetcher ?? fetch)(TARGET_URL[request.target], {
      method: "POST",
      headers: { Authorization: `Bearer ${request.authorization}`, "Content-Type": "application/json" },
      body: request.body,
      redirect: "error",
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await readBoundedBody(response, maxResponseBytes);
    const retryAfter = Number(response.headers.get("retry-after"));
    return { status: response.status, body, providerRequestId: response.headers.get("x-slack-req-id"), retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter >= 0 && retryAfter <= 3600 ? retryAfter : null };
  } catch (error) {
    if (error instanceof IntegrationEgressError) throw error;
    if (request.signal?.aborted) throw new IntegrationEgressError(requestStarted ? "EGRESS_CANCELLED_AFTER_DISPATCH" : "EGRESS_CANCELLED");
    if (controller.signal.aborted) throw new IntegrationEgressError("EGRESS_TIMEOUT");
    throw new IntegrationEgressError("EGRESS_CONNECTION_FAILED");
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
  }
}
