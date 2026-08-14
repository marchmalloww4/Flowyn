import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { schema, workflowApprovalRequests, workflowRunDispatches, workflowRuns, workflowStepRuns } from "@/lib/database/schema";

describe("Milestone 9 approval schema", () => {
  it("exports workspace-scoped approval requests with safe decision fields", () => {
    expect(schema.workflowApprovalRequests).toBe(workflowApprovalRequests);
    expect(workflowApprovalRequests.workspaceId).toBeDefined();
    expect(workflowApprovalRequests.workflowRunId).toBeDefined();
    expect(workflowApprovalRequests.workflowStepId).toBeDefined();
    expect(workflowApprovalRequests.workflowName).toBeDefined();
    expect(workflowApprovalRequests.workflowStepName).toBeDefined();
    expect(workflowApprovalRequests.requiredRole).toBeDefined();
    expect(workflowApprovalRequests.status).toBeDefined();
    expect(workflowApprovalRequests.safeContext).toBeDefined();
    expect(workflowApprovalRequests.expiresAt).toBeDefined();
    expect(workflowApprovalRequests.decidedBy).toBeDefined();
  });

  it("declares approval status/role checks, expiry indexes, and one request per run step", () => {
    const approvalConfig = getTableConfig(workflowApprovalRequests);
    expect(approvalConfig.checks.length).toBeGreaterThanOrEqual(3);
    expect(approvalConfig.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining([
      "workflow_approval_requests_workspace_status_idx",
      "workflow_approval_requests_expires_idx",
      "workflow_approval_requests_run_step_idx",
    ]));
    expect(approvalConfig.foreignKeys.length).toBeGreaterThanOrEqual(2);
  });

  it("adds waiting/terminal workflow states and durable continuation generation", () => {
    expect(workflowRuns.status).toBeDefined();
    expect(workflowStepRuns.status).toBeDefined();
    expect(workflowRunDispatches.dispatchGeneration).toBeDefined();
    expect(getTableConfig(workflowRuns).checks.length).toBeGreaterThan(0);
    expect(getTableConfig(workflowStepRuns).checks.length).toBeGreaterThan(0);
  });
});
