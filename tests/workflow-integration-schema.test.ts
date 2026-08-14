import { describe, expect, it } from "vitest";
import { validateWorkflowDefinition, workflowDefinitionSchema } from "@/lib/workflows/validation";

const credentialId = "00000000-0000-4000-8000-000000000000";

describe("integration workflow step schema", () => {
  it("accepts a strict Slack action with bounded expressions", () => {
    const definition = {
      schemaVersion: 1,
      entryStepId: "approval",
      steps: [
        { id: "approval", type: "APPROVAL", name: "Review", config: { requiredRole: "ADMIN", review: { kind: "literal", value: "Send this message" } }, nextStepId: "slack" },
        { id: "slack", type: "INTEGRATION_ACTION", name: "Post message", config: { connectorId: "slack", credentialId, operation: "post_message", input: { channel: { kind: "literal", value: "C123" }, text: { kind: "literal", value: "Hello" } } } },
      ],
    };
    expect(validateWorkflowDefinition(definition)).toEqual(definition);
  });

  it("rejects arbitrary endpoint controls and non-ancestor references", () => {
    const base = { schemaVersion: 1, entryStepId: "slack", steps: [{ id: "slack", type: "INTEGRATION_ACTION", name: "Post", config: { connectorId: "slack", credentialId, operation: "post_message", input: { channel: { kind: "literal", value: "C123" }, text: { kind: "literal", value: "Hello" } }, url: "https://example.test" } }] };
    expect(workflowDefinitionSchema.safeParse(base).success).toBe(false);
    expect(() => validateWorkflowDefinition({ schemaVersion: 1, entryStepId: "slack", steps: [{ id: "slack", type: "INTEGRATION_ACTION", name: "Post", config: { connectorId: "slack", credentialId, operation: "post_message", input: { channel: { kind: "reference", path: "steps.future.output" }, text: { kind: "literal", value: "Hello" } } } }] })).toThrow(/ancestor|approval/i);
  });
});
