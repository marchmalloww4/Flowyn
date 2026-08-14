import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { schema, workflowEditorLayouts, workflowRunDispatches, workflowRuns, workflowVersions } from "@/lib/database/schema";

describe("Milestone 10 workflow editor schema", () => {
  it("exports a separate current-layout metadata table", () => {
    expect(schema.workflowEditorLayouts).toBe(workflowEditorLayouts);
    expect(workflowEditorLayouts.workspaceId).toBeDefined();
    expect(workflowEditorLayouts.workflowId).toBeDefined();
    expect(workflowEditorLayouts.workflowVersionId).toBeDefined();
    expect(workflowEditorLayouts.layout).toBeDefined();
    expect(workflowEditorLayouts.updatedBy).toBeDefined();
  });

  it("keeps layout metadata structurally separate from executable definitions and snapshots", () => {
    expect("layout" in workflowVersions).toBe(false);
    expect("layout" in workflowRuns).toBe(false);
    expect("layout" in workflowRunDispatches).toBe(false);
    expect(getTableConfig(workflowEditorLayouts).indexes.map((index) => index.config.name)).toContain("workflow_editor_layouts_workflow_idx");
  });
});
