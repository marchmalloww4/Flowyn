import { describe, expect, it } from "vitest";
import { canManageWebhook, formatWebhookEventStatus } from "@/lib/webhooks/ui";

describe("webhook panel policy", () => {
  it("keeps MEMBER management read-only", () => {
    expect(canManageWebhook("OWNER")).toBe(true);
    expect(canManageWebhook("ADMIN")).toBe(true);
    expect(canManageWebhook("MEMBER")).toBe(false);
  });

  it("formats safe delivery status without payload material", () => {
    expect(formatWebhookEventStatus("TRIGGERED", null)).toBe("Triggered");
    expect(formatWebhookEventStatus("SKIPPED", "WORKFLOW_DISABLED")).toBe("Skipped: workflow disabled");
    expect(formatWebhookEventStatus("FAILED", "INTERNAL_ERROR")).toBe("Failed");
  });
});
