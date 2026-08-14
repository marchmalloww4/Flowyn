import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { canPerformWorkspaceAction } from "@/lib/authz/authorization";
import { schema, workflowRunDispatches, workflowRuns, workflowStepRuns, workflowVersions, workflows } from "@/lib/database/schema";

describe("Milestone 6 workflow schema", () => {
  it("exports workflow definitions, immutable versions, runs, steps, and dispatches", () => {
    expect(schema.workflows).toBe(workflows);
    expect(schema.workflowVersions).toBe(workflowVersions);
    expect(schema.workflowRuns).toBe(workflowRuns);
    expect(schema.workflowStepRuns).toBe(workflowStepRuns);
    expect(schema.workflowRunDispatches).toBe(workflowRunDispatches);
    expect(workflows.workspaceId).toBeDefined();
    expect(workflows.currentVersion).toBeDefined();
    expect(workflowVersions.definition).toBeDefined();
    expect(workflowRuns.definitionSnapshot).toBeDefined();
    expect(workflowRuns.idempotencyKey).toBeDefined();
    expect(workflowRuns.executionToken).toBeDefined();
    expect(workflowRuns.leaseExpiresAt).toBeDefined();
    expect(workflowStepRuns.safeInput).toBeDefined();
    expect(workflowStepRuns.safeOutput).toBeDefined();
    expect(workflowStepRuns.agentRunId).toBeDefined();
    expect(workflowRunDispatches.runId).toBeDefined();
    expect("reasoning" in workflowStepRuns).toBe(false);
  });

  it("declares status checks, attempt/version uniqueness, and workspace indexes", () => {
    const workflowConfig = getTableConfig(workflows);
    const versionConfig = getTableConfig(workflowVersions);
    const runConfig = getTableConfig(workflowRuns);
    const stepConfig = getTableConfig(workflowStepRuns);
    const dispatchConfig = getTableConfig(workflowRunDispatches);

    expect(workflowConfig.checks.length).toBeGreaterThan(0);
    expect(versionConfig.indexes.map((index) => index.config.name)).toContain("workflow_versions_workflow_version_idx");
    expect(runConfig.checks.length).toBeGreaterThan(0);
    expect(runConfig.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining(["workflow_runs_workspace_created_idx", "workflow_runs_status_idx"]));
    expect(stepConfig.checks.length).toBeGreaterThan(0);
    expect(stepConfig.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining(["workflow_step_runs_run_idx", "workflow_step_runs_attempt_idx"]));
    expect(dispatchConfig.checks.length).toBeGreaterThan(0);
    expect(dispatchConfig.indexes.map((index) => index.config.name)).toContain("workflow_run_dispatches_status_idx");
  });

  it("allows members to read/run and self-cancel workflows while reserving mutation for administrators", () => {
    expect(canPerformWorkspaceAction("MEMBER", "workflow.read")).toBe(true);
    expect(canPerformWorkspaceAction("MEMBER", "workflow.run")).toBe(true);
    expect(canPerformWorkspaceAction("MEMBER", "workflow.cancel")).toBe(true);
    expect(canPerformWorkspaceAction("MEMBER", "workflow.write")).toBe(false);
    expect(canPerformWorkspaceAction("ADMIN", "workflow.write")).toBe(true);
    expect(canPerformWorkspaceAction("ADMIN", "workflow.delete")).toBe(true);
  });
});
