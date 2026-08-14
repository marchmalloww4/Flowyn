import { describe, expect, it, vi } from "vitest";
import { workflowScheduleOccurrences, workflowWebhookEvents, workflowWebhookTriggers } from "@/lib/database/schema";
import { webhookAutomationPrincipal } from "@/lib/security/principal";
import { resolveWorkflowRunPrincipal } from "@/lib/workflows/service";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const triggerId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";

function database() {
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table) => {
      if (table === workflowScheduleOccurrences) {
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
      }
      if (table === workflowWebhookEvents) {
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: eventId, workspaceId, triggerId }]) }) };
      }
      if (table === workflowWebhookTriggers) {
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: triggerId, workspaceId }]) }) };
      }
      return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
    }),
  });
  return { select };
}

describe("webhook workflow automation origin", () => {
  it("resolves a webhook run to its trigger and event origin", async () => {
    const principal = await resolveWorkflowRunPrincipal({ id: runId, workspaceId, startedBy: null } as never, database() as never);
    expect(principal).toEqual(webhookAutomationPrincipal(workspaceId, triggerId, eventId));
  });
});
