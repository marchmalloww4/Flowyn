import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/security/errors";

const mocks = vi.hoisted(() => ({ ingest: vi.fn(), getRedis: vi.fn(), getEnv: vi.fn() }));
vi.mock("@/lib/webhooks/ingress", () => ({ ingestWebhookDelivery: mocks.ingest }));
vi.mock("@/lib/queue/connection", () => ({ getQueueConnection: mocks.getRedis }));
vi.mock("@/lib/env", () => ({ getEnv: mocks.getEnv }));

import { POST } from "@/app/api/hooks/[publicId]/route";

describe("public webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEnv.mockReturnValue({ WEBHOOK_MAX_BODY_BYTES: 262_144 });
    mocks.getRedis.mockReturnValue({});
    mocks.ingest.mockResolvedValue({ accepted: true, duplicate: false });
  });

  it("passes raw bytes and protocol headers to the ingress service", async () => {
    const response = await POST(new Request("http://localhost/api/hooks/public-1", {
      method: "POST",
      body: '{"event":"publish"}',
      headers: { "Content-Type": "application/json", "X-Flowyn-Timestamp": "1700000000", "X-Flowyn-Signature": "v1=" + "a".repeat(64), "X-Flowyn-Event-Id": "delivery-1" },
    }), { params: Promise.resolve({ publicId: "public-1" }) });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, duplicate: false });
    expect(mocks.ingest).toHaveBeenCalledWith(expect.objectContaining({ publicId: "public-1", timestamp: "1700000000", eventId: "delivery-1", contentType: "application/json", rawBody: expect.any(Uint8Array), redis: mocks.getRedis.mock.results[0].value }));
  });

  it("rejects an oversized declared body before reading it", async () => {
    const response = await POST(new Request("http://localhost/api/hooks/public-1", { method: "POST", body: "{}", headers: { "Content-Type": "application/json", "Content-Length": "262145" } }), { params: Promise.resolve({ publicId: "public-1" }) });
    expect(response.status).toBe(401);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });

  it("maps service failures without exposing internal detail", async () => {
    mocks.ingest.mockRejectedValue(new AppError("WEBHOOK_REJECTED", 401, "Webhook request could not be accepted."));
    const response = await POST(new Request("http://localhost/api/hooks/public-1", { method: "POST", body: "{}", headers: { "Content-Type": "application/json", "X-Flowyn-Timestamp": "1700000000", "X-Flowyn-Signature": "v1=" + "a".repeat(64) } }), { params: Promise.resolve({ publicId: "public-1" }) });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "WEBHOOK_REJECTED", message: "Webhook request could not be accepted." } });
  });
});
