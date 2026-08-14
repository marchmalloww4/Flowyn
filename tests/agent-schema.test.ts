import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { agentRunSteps, agentRuns, agents, schema } from "@/lib/database/schema";
import { canPerformWorkspaceAction } from "@/lib/authz/authorization";

describe("Milestone 5 agent schema", () => {
  it("exports definitions, runs, and safe run-step tables", () => {
    expect(schema.agents).toBe(agents);
    expect(schema.agentRuns).toBe(agentRuns);
    expect(schema.agentRunSteps).toBe(agentRunSteps);
    expect(agents.workspaceId).toBeDefined();
    expect(agents.brandId).toBeDefined();
    expect(agents.allowedTools).toBeDefined();
    expect(agents.enabled).toBeDefined();
    expect(agents.deletedAt).toBeDefined();
    expect(agentRuns.status).toBeDefined();
    expect(agentRuns.goal).toBeDefined();
    expect(agentRuns.finalResponse).toBeDefined();
    expect(agentRunSteps.safeInputMetadata).toBeDefined();
    expect(agentRunSteps.safeOutputMetadata).toBeDefined();
    expect("reasoning" in agentRunSteps).toBe(false);
  });

  it("declares status/type checks and workspace-oriented indexes", () => {
    const agentConfig = getTableConfig(agents);
    const runConfig = getTableConfig(agentRuns);
    const stepConfig = getTableConfig(agentRunSteps);

    expect(agentConfig.checks).toHaveLength(1);
    expect(runConfig.checks).toHaveLength(1);
    expect(stepConfig.checks).toHaveLength(2);
    expect(agentConfig.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining(["agents_workspace_idx"]));
    expect(runConfig.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining(["agent_runs_workspace_created_idx", "agent_runs_agent_idx", "agent_runs_status_idx"]));
    expect(stepConfig.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining(["agent_run_steps_run_idx", "agent_run_steps_workspace_idx"]));
  });

  it("allows members to read/run agents but reserves mutations for administrators", () => {
    expect(canPerformWorkspaceAction("MEMBER", "agent.read")).toBe(true);
    expect(canPerformWorkspaceAction("MEMBER", "agent.run")).toBe(true);
    expect(canPerformWorkspaceAction("MEMBER", "agent.write")).toBe(false);
    expect(canPerformWorkspaceAction("ADMIN", "agent.write")).toBe(true);
    expect(canPerformWorkspaceAction("ADMIN", "agent.delete")).toBe(true);
  });
});
