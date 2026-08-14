import { describe, expect, it } from "vitest";
import { validateIntegrationApprovalPolicy } from "@/lib/workflows/integration-policy";

const credentialId = "00000000-0000-4000-8000-000000000000";
const action = { id: "action", type: "INTEGRATION_ACTION" as const, name: "Slack", config: { connectorId: "slack" as const, credentialId, operation: "post_message" as const, input: { channel: { kind: "literal" as const, value: "C1" }, text: { kind: "literal" as const, value: "Hi" } } } };
const approval = { id: "approval", type: "APPROVAL" as const, name: "Approve", config: { requiredRole: "ADMIN" as const }, nextStepId: "action" };

describe("integration approval policy", () => {
  it("accepts an approval on every reachable path", () => {
    expect(() => validateIntegrationApprovalPolicy({ schemaVersion: 1, entryStepId: "approval", steps: [approval, action] })).not.toThrow();
  });

  it("rejects missing approval and bypass branches", () => {
    expect(() => validateIntegrationApprovalPolicy({ schemaVersion: 1, entryStepId: "action", steps: [action] })).toThrow(/approval/i);
    const branch = { id: "branch", type: "CONDITION" as const, name: "Branch", config: { left: { kind: "literal" as const, value: true }, operator: "equals" as const, right: { kind: "literal" as const, value: true }, onTrueStepId: "approval", onFalseStepId: "action" } };
    expect(() => validateIntegrationApprovalPolicy({ schemaVersion: 1, entryStepId: "branch", steps: [branch, approval, action] })).toThrow(/approval/i);
  });

  it("does not impose a global approval rule on non-side-effect steps", () => {
    expect(() => validateIntegrationApprovalPolicy({ schemaVersion: 1, entryStepId: "set", steps: [{ id: "set", type: "SET_VALUE", name: "Set", config: { value: { kind: "literal", value: "ok" } } }] })).not.toThrow();
  });
});
