import { describe, expect, it } from "vitest";
import { canManageWorkflows, filterWorkspaceWorkflows, workflowStatusLabel, type WorkflowRecord } from "@/lib/client/workflows-state";

const workflows: WorkflowRecord[] = [
  { id: "workflow-a", workspaceId: "workspace-a", enabled: true, name: "Alpha", currentVersion: 2 },
  { id: "workflow-b", workspaceId: "workspace-b", enabled: false, name: "Beta", currentVersion: 1 },
];

describe("workflow presentation state", () => {
  it("keeps workflow lists isolated by workspace", () => {
    expect(filterWorkspaceWorkflows(workflows, "workspace-a").map((workflow) => workflow.id)).toEqual(["workflow-a"]);
  });

  it("uses existing role boundaries and safe status labels", () => {
    expect(canManageWorkflows("OWNER")).toBe(true);
    expect(canManageWorkflows("MEMBER")).toBe(false);
    expect(workflowStatusLabel("WAITING_APPROVAL")).toBe("Waiting for approval");
    expect(workflowStatusLabel("CANCEL_REQUESTED")).toBe("Cancellation requested");
  });
});
