import { describe, expect, it } from "vitest";
import { schema, workflowWebhookEvents, workflowWebhookTriggers } from "@/lib/database/schema";

describe("Milestone 8 webhook database schema", () => {
  it("exports trigger and event tables", () => {
    expect(Object.keys(schema)).toEqual(expect.arrayContaining(["workflowWebhookTriggers", "workflowWebhookEvents"]));
    expect(workflowWebhookTriggers.publicId).toBeDefined();
    expect(workflowWebhookTriggers.secretCiphertext).toBeDefined();
    expect(workflowWebhookEvents.dedupeKey).toBeDefined();
    expect(workflowWebhookEvents.payloadSha256).toBeDefined();
  });

  it("does not model raw payload or secret columns", () => {
    expect("secret" in workflowWebhookTriggers).toBe(false);
    expect("rawBody" in workflowWebhookEvents).toBe(false);
    expect("headers" in workflowWebhookEvents).toBe(false);
  });
});
