import { describe, expect, it } from "vitest";
import { canManageWebhooks, filterWorkspaceWebhooks, type WebhookRecord } from "@/lib/client/webhooks-state";

const webhooks: WebhookRecord[] = [{ id: "hook-a", workspaceId: "workspace-a", enabled: true, name: "Inbound" }];

describe("webhook presentation state", () => {
  it("filters webhook records to the selected workspace", () => {
    expect(filterWorkspaceWebhooks(webhooks, "workspace-a")).toHaveLength(1);
    expect(filterWorkspaceWebhooks(webhooks, "workspace-b")).toEqual([]);
  });

  it("keeps webhook management role-aware", () => {
    expect(canManageWebhooks("OWNER")).toBe(true);
    expect(canManageWebhooks("ADMIN")).toBe(true);
    expect(canManageWebhooks("MEMBER")).toBe(false);
  });
});
