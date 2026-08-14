import { describe, expect, it } from "vitest";
import { validateWebhookPayload, webhookCreateSchema, webhookUpdateSchema } from "@/lib/webhooks/validation";

describe("webhook validation", () => {
  it("requires a workflow and bounded name for management creation", () => {
    expect(webhookCreateSchema.safeParse({ workspaceId: "550e8400-e29b-41d4-a716-446655440000", workflowId: "550e8400-e29b-41d4-a716-446655440001", name: "Inbound" }).success).toBe(true);
    expect(webhookCreateSchema.safeParse({ workspaceId: "not-a-uuid", workflowId: "x", name: "" }).success).toBe(false);
    expect(webhookUpdateSchema.safeParse({ secret: "do-not-accept" }).success).toBe(false);
  });

  it("accepts only bounded JSON objects", () => {
    expect(validateWebhookPayload(Buffer.from('{"event":"publish","items":[1,2]}'))).toEqual({ event: "publish", items: [1, 2] });
    expect(() => validateWebhookPayload(Buffer.from("[]"))).toThrow();
    expect(() => validateWebhookPayload(Buffer.alloc(262_145))).toThrow();
  });
});
