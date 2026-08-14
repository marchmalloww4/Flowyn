import { describe, expect, it } from "vitest";
import { integrationActionRuns } from "@/lib/database/schema";
import { INTEGRATION_ACTION_STATUSES } from "@/lib/integrations/policy";

describe("integration action schema", () => {
  it("stores durable safe action identity and terminal state fields", () => {
    expect(Object.keys(integrationActionRuns)).toEqual(expect.arrayContaining([
      "id", "workspaceId", "workflowRunId", "workflowStepId", "workflowStepRunId", "connectorId", "operation", "credentialId", "credentialSecretVersion", "idempotencyKey", "attempt", "status", "providerRequestId", "safeResponseMetadata", "safeOutput", "errorCode", "leaseExpiresAt", "startedAt", "completedAt", "createdAt", "updatedAt",
    ]));
    expect(INTEGRATION_ACTION_STATUSES).toEqual(["PENDING", "IN_FLIGHT", "SUCCEEDED", "FAILED", "AMBIGUOUS", "CANCELLED"]);
    expect("plaintextSecret" in integrationActionRuns).toBe(false);
  });
});
