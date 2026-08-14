import { describe, expect, it } from "vitest";
import { toSafeWebhookEvent, toSafeWebhookTrigger } from "@/lib/webhooks/repository";

describe("webhook repository projections", () => {
  it("removes encrypted secrets from trigger projections", () => {
    const safe = toSafeWebhookTrigger({
      id: "trigger-1",
      workspaceId: "workspace-1",
      workflowId: "workflow-1",
      publicId: "public-1",
      name: "Inbound",
      enabled: true,
      secretCiphertext: "ciphertext",
      secretKeyVersion: "v1",
      secretVersion: 2,
      createdBy: "user-1",
      createdAt: new Date("2026-08-14T00:00:00.000Z"),
      updatedAt: new Date("2026-08-14T00:00:00.000Z"),
      deletedAt: null,
    });
    expect(safe).toMatchObject({ id: "trigger-1", secretVersion: 2 });
    expect("secretCiphertext" in safe).toBe(false);
    expect("secretKeyVersion" in safe).toBe(false);
  });

  it("returns event metadata without raw request material", () => {
    const safe = toSafeWebhookEvent({
      id: "event-1", workspaceId: "workspace-1", triggerId: "trigger-1", externalEventIdHash: null,
      dedupeKey: "event:hash", dedupeWindowStart: null, payloadSha256: "payload-hash", payloadBytes: 20,
      contentType: "application/json", secretVersion: 1, status: "TRIGGERED", reasonCode: null,
      workflowRunId: "run-1", receivedAt: new Date(), processedAt: null, lastSeenAt: new Date(), duplicateCount: 0,
      expiresAt: new Date(),
    });
    expect(safe.payloadSha256).toBe("payload-hash");
    expect("dedupeKey" in safe).toBe(false);
    expect("rawBody" in safe).toBe(false);
    expect("contentType" in safe).toBe(true);
  });
});
