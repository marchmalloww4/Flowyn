import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowStepError } from "@/lib/workflows/errors";
import { executeIntegrationAction } from "@/lib/workflows/executors/integration-action";

const mocks = vi.hoisted(() => ({
  resolveActiveIntegrationCredential: vi.fn(),
  decryptIntegrationCredentialSecret: vi.fn(),
  claimIntegrationAction: vi.fn(),
  completeIntegrationAction: vi.fn(),
  failIntegrationAction: vi.fn(),
  markIntegrationCredentialUsed: vi.fn(),
  getConnectorOperation: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/lib/integrations/credentials", () => ({ resolveActiveIntegrationCredential: mocks.resolveActiveIntegrationCredential, decryptIntegrationCredentialSecret: mocks.decryptIntegrationCredentialSecret }));
vi.mock("@/lib/integrations/actions", () => ({ actionIdempotencyKey: (runId: string, stepId: string) => `${runId}:${stepId}`, claimIntegrationAction: mocks.claimIntegrationAction, completeIntegrationAction: mocks.completeIntegrationAction, failIntegrationAction: mocks.failIntegrationAction }));
vi.mock("@/lib/integrations/repository", () => ({ markIntegrationCredentialUsed: mocks.markIntegrationCredentialUsed }));
vi.mock("@/lib/integrations/registry", () => ({ getConnectorOperation: mocks.getConnectorOperation }));

const config = { connectorId: "slack" as const, credentialId: "11111111-1111-4111-8111-111111111111", operation: "post_message" as const, input: { channel: { kind: "literal" as const, value: "C123" }, text: { kind: "literal" as const, value: "Hello" } } };
const context = { runId: "run-1", workspaceId: "workspace-1", workflowStepId: "slack", workflowStepRunId: "step-run-1", actorUserId: null, workflowId: "workflow-1", workflowVersion: 1, triggerInput: {}, stepOutputs: {}, abortSignal: new AbortController().signal, db: {} as never };

describe("durable integration workflow executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActiveIntegrationCredential.mockResolvedValue({ id: config.credentialId, workspaceId: "workspace-1", connectorId: "slack", secretVersion: 2, encryptedSecretMaterial: "ciphertext" });
    mocks.decryptIntegrationCredentialSecret.mockReturnValue({ apiToken: "xoxb-secret" });
    mocks.claimIntegrationAction.mockResolvedValue({ disposition: "CLAIMED", action: { id: "action-1", status: "IN_FLIGHT", attempt: 1 } });
    mocks.completeIntegrationAction.mockResolvedValue({ id: "action-1", status: "SUCCEEDED", safeOutput: { provider: "slack", channel: "C123", providerMessageId: "ts" } });
    mocks.getConnectorOperation.mockReturnValue({ executor: { execute: vi.fn().mockResolvedValue({ output: { provider: "slack", channel: "C123", providerMessageId: "ts" }, safeMetadata: { provider: "slack" }, providerRequestId: "req" }) } });
  });

  it("resolves a current workspace credential, claims before egress, and returns safe output", async () => {
    const result = await executeIntegrationAction(context, config);
    expect(result.output).toEqual({ provider: "slack", channel: "C123", providerMessageId: "ts" });
    expect(mocks.claimIntegrationAction).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-1", workflowRunId: "run-1", workflowStepRunId: "step-run-1", credentialSecretVersion: 2 }), context.db);
    expect(mocks.decryptIntegrationCredentialSecret).toHaveBeenCalledWith(expect.objectContaining({ id: config.credentialId }),);
    expect(JSON.stringify(result)).not.toContain("xoxb-secret");
  });

  it("recovers a persisted success without decrypting or calling the provider again", async () => {
    mocks.claimIntegrationAction.mockResolvedValue({ disposition: "SUCCEEDED", action: { id: "action-1", status: "SUCCEEDED", safeOutput: { provider: "slack", channel: "C123", providerMessageId: "old" }, safeResponseMetadata: {} } });
    await expect(executeIntegrationAction(context, config)).resolves.toMatchObject({ output: { providerMessageId: "old" } });
    expect(mocks.decryptIntegrationCredentialSecret).not.toHaveBeenCalled();
    expect(mocks.getConnectorOperation().executor.execute).not.toHaveBeenCalled();
  });

  it("turns an ambiguous provider outcome into a non-retryable workflow error", async () => {
    const provider = vi.fn().mockRejectedValue(new WorkflowStepError("INTEGRATION_PROVIDER_AMBIGUOUS", 502, "ambiguous", false));
    mocks.getConnectorOperation.mockReturnValue({ executor: { execute: provider } });
    await expect(executeIntegrationAction(context, config)).rejects.toMatchObject({ code: "INTEGRATION_PROVIDER_AMBIGUOUS", retryable: false });
    expect(mocks.failIntegrationAction).toHaveBeenCalledWith(expect.objectContaining({ actionId: "action-1", ambiguous: true }), context.db);
  });

  it("does not execute an active duplicate claim", async () => {
    mocks.claimIntegrationAction.mockResolvedValue({ disposition: "IN_FLIGHT", action: { id: "action-1", status: "IN_FLIGHT" } });
    await expect(executeIntegrationAction(context, config)).rejects.toMatchObject({ code: "INTEGRATION_ACTION_IN_FLIGHT", retryable: false });
  });

  it("persists known provider failures as retryable-safe FAILED actions", async () => {
    const provider = vi.fn().mockRejectedValue(new WorkflowStepError("INTEGRATION_RATE_LIMITED", 429, "rate limited", true));
    mocks.getConnectorOperation.mockReturnValue({ executor: { execute: provider } });
    await expect(executeIntegrationAction(context, config)).rejects.toMatchObject({ code: "INTEGRATION_RATE_LIMITED", retryable: true });
    expect(mocks.failIntegrationAction).toHaveBeenCalledWith(expect.objectContaining({ actionId: "action-1", ambiguous: false, cancelled: false }), context.db);
  });

  it("cancels before dispatch without decrypting or invoking the provider", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(executeIntegrationAction({ ...context, abortSignal: controller.signal }, config)).rejects.toMatchObject({ code: "INTEGRATION_ACTION_CANCELLED", retryable: false });
    expect(mocks.decryptIntegrationCredentialSecret).not.toHaveBeenCalled();
    expect(mocks.getConnectorOperation().executor.execute).not.toHaveBeenCalled();
    expect(mocks.failIntegrationAction).toHaveBeenCalledWith(expect.objectContaining({ actionId: "action-1", cancelled: true, ambiguous: false }), context.db);
  });
});
