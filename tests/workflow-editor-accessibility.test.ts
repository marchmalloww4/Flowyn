import { describe, expect, it } from "vitest";
import { workflowStepAnnouncement } from "@/lib/client/workflow-editor-state";

describe("workflow editor accessible fallback", () => {
  it("describes each executable step without relying on canvas coordinates", () => {
    expect(workflowStepAnnouncement({ name: "Start", type: "SET_VALUE" }, 0)).toBe("Step 1: Start (SET_VALUE)");
    expect(workflowStepAnnouncement({ name: "Approval", type: "APPROVAL" }, 1)).toBe("Step 2: Approval (APPROVAL)");
  });
});
