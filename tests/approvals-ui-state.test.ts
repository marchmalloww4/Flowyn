import { describe, expect, it } from "vitest";
import { approvalStatusLabel, canDecideApprovals, filterWorkspaceApprovals, type ApprovalRecord } from "@/lib/client/approvals-state";

const approvals: ApprovalRecord[] = [{ id: "approval-a", workspaceId: "workspace-a", status: "PENDING", workflowName: "Alpha", workflowStepName: "Review" }];

describe("approval inbox state", () => {
  it("filters requests to the selected workspace", () => {
    expect(filterWorkspaceApprovals(approvals, "workspace-a")).toHaveLength(1);
    expect(filterWorkspaceApprovals(approvals, "workspace-b")).toEqual([]);
  });

  it("allows decisions only for OWNER and ADMIN and labels pending requests", () => {
    expect(canDecideApprovals("OWNER")).toBe(true);
    expect(canDecideApprovals("MEMBER")).toBe(false);
    expect(approvalStatusLabel("PENDING")).toBe("Awaiting decision");
  });
});
