import { describe, expect, it } from "vitest";
import { deserializeWorkflowDefinition } from "@/lib/workflows/editor";
import { workflowEditorReducer } from "@/lib/workflows/editor-state";

const definition = {
  schemaVersion: 1 as const,
  entryStepId: "start",
  steps: [{ id: "start", type: "SET_VALUE" as const, name: "Start", config: { value: { kind: "literal" as const, value: "hello" } } }],
};

describe("workflow editor state", () => {
  it("marks a configuration edit dirty and preserves it through a save failure", () => {
    const initial = deserializeWorkflowDefinition(definition);
    const edited = workflowEditorReducer(initial, { type: "update-node", nodeId: "start", patch: { name: "Edited" } });
    const failed = workflowEditorReducer(edited, { type: "save-failed", message: "Save failed." });

    expect(edited.dirty).toBe(true);
    expect(failed.dirty).toBe(true);
    expect(failed.nodes[0]?.name).toBe("Edited");
    expect(failed.error).toBe("Save failed.");
  });

  it("preserves unsaved edits and reports a conflict when a save is stale", () => {
    const initial = deserializeWorkflowDefinition(definition);
    const edited = workflowEditorReducer(initial, { type: "update-node", nodeId: "start", patch: { name: "Unsaved" } });
    const conflicted = workflowEditorReducer(edited, { type: "save-conflict", currentVersionId: "new-version" });

    expect(conflicted.dirty).toBe(true);
    expect(conflicted.nodes[0]?.name).toBe("Unsaved");
    expect(conflicted.conflictVersionId).toBe("new-version");
  });

  it("clears dirty state only after a successful save", () => {
    const initial = deserializeWorkflowDefinition(definition);
    const edited = workflowEditorReducer(initial, { type: "update-node", nodeId: "start", patch: { name: "Saved" } });
    const saved = workflowEditorReducer(edited, { type: "save-succeeded", versionId: "saved-version", layout: edited.layout });

    expect(saved.dirty).toBe(false);
    expect(saved.error).toBeNull();
    expect(saved.conflictVersionId).toBeNull();
    expect(saved.versionId).toBe("saved-version");
  });
});
