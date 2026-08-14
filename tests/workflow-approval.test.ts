import { describe, expect, it } from "vitest";
import { createDefaultWorkflowStepRegistry } from "@/lib/workflows/registry";
import { validateWorkflowDefinition, workflowDefinitionSchema } from "@/lib/workflows/validation";
import type { WorkflowStepExecutionContext } from "@/lib/workflows/types";

const baseApproval = {
  id: "approval",
  type: "APPROVAL" as const,
  name: "Approve release",
  config: { requiredRole: "OWNER" as const },
};

function context(): WorkflowStepExecutionContext {
  return {
    runId: "run",
    workspaceId: "workspace",
    actorUserId: "user",
    workflowId: "workflow",
    workflowVersion: 1,
    triggerInput: {},
    stepOutputs: {},
    abortSignal: new AbortController().signal,
    db: {} as never,
  };
}

describe("workflow approval step contracts", () => {
  it("accepts OWNER and ADMIN approval steps, including terminal and chained approvals", () => {
    expect(validateWorkflowDefinition({ schemaVersion: 1, entryStepId: "approval", steps: [baseApproval] })).toEqual({
      schemaVersion: 1,
      entryStepId: "approval",
      steps: [baseApproval],
    });

    const chained = {
      schemaVersion: 1 as const,
      entryStepId: "approval",
      steps: [
        { ...baseApproval, config: { requiredRole: "ADMIN" as const, expiresAfterSeconds: 60 }, nextStepId: "done" },
        { id: "done", type: "SET_VALUE" as const, name: "Done", config: { value: { kind: "literal" as const, value: "ok" } } },
      ],
    };
    expect(validateWorkflowDefinition(chained)).toEqual(chained);
  });

  it("enforces approval roles and expiration bounds", () => {
    const valid = { ...baseApproval, config: { requiredRole: "OWNER" as const, expiresAfterSeconds: 31_536_000 } };
    expect(workflowDefinitionSchema.safeParse({ schemaVersion: 1, entryStepId: "approval", steps: [valid] }).success).toBe(true);

    for (const expiresAfterSeconds of [59, 31_536_001, 1.5, "60"]) {
      expect(workflowDefinitionSchema.safeParse({
        schemaVersion: 1,
        entryStepId: "approval",
        steps: [{ ...baseApproval, config: { requiredRole: "OWNER", expiresAfterSeconds } }],
      }).success).toBe(false);
    }

    for (const config of [{}, { requiredRole: "MEMBER" }, { requiredRole: "OWNER", unexpected: true }]) {
      expect(workflowDefinitionSchema.safeParse({ schemaVersion: 1, entryStepId: "approval", steps: [{ ...baseApproval, config }] }).success).toBe(false);
    }
  });

  it("registers an approval executor that can only request a decision", async () => {
    const executor = createDefaultWorkflowStepRegistry().get("APPROVAL");
    const result = await executor.execute(context(), { requiredRole: "ADMIN", expiresAfterSeconds: 60 });

    expect(result).toMatchObject({
      output: null,
      nextStepId: null,
      control: { type: "WAITING_APPROVAL", requiredRole: "ADMIN", expiresAfterSeconds: 60 },
      safeMetadata: { operation: "APPROVAL", requiredRole: "ADMIN" },
    });
    expect(result).not.toHaveProperty("decision");
  });
});
