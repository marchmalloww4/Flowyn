import { describe, expect, it } from "vitest";
import {
  agentDecisionOperationKey,
  directAiOperationKey,
  integrationOperationKey,
  webhookOperationKey,
  workflowAiOperationKey,
  workflowStartOperationKey,
} from "@/lib/usage/policy";

describe("workspace usage operation keys", () => {
  it("uses stable bounded keys for durable logical operations", () => {
    expect(workflowStartOperationKey("run-1")).toBe("workflow-start:run-1");
    expect(webhookOperationKey("trigger-1", "event-1")).toBe("webhook:trigger-1:event-1");
    expect(workflowAiOperationKey("run-1", "step-1")).toBe("workflow-ai:run-1:step-1");
    expect(agentDecisionOperationKey("agent-run-1", 2)).toBe("agent-ai:agent-run-1:2");
    expect(integrationOperationKey("action-1")).toBe("integration:action-1");
    expect(directAiOperationKey("request-1")).toBe("direct-ai:request-1");
  });

  it("does not include raw content in operation keys", () => {
    const key = directAiOperationKey("request-1");
    expect(key).not.toContain("prompt");
    expect(key).not.toContain("response");
    expect(key).not.toContain("secret");
  });
});
