import { describe, expect, it, vi } from "vitest";
import { slackPostMessageExecutor, classifySlackFailure } from "@/lib/integrations/slack";
import { IntegrationEgressError } from "@/lib/integrations/egress";

describe("Slack post_message connector", () => {
  it("constructs only the fixed bounded request and returns safe output", async () => {
    const egress = vi.fn().mockResolvedValue({ status: 200, providerRequestId: "req-1", body: JSON.stringify({ ok: true, channel: "C123", ts: "1710000000.0001" }) });
    const result = await slackPostMessageExecutor.execute({ workspaceId: "workspace", workflowRunId: "run", workflowStepId: "step", workflowStepRunId: "step-run", idempotencyKey: "action", abortSignal: new AbortController().signal, egress } as never, { channel: "C123", text: "Hello" }, { apiToken: "xoxb-secret" });
    expect(egress).toHaveBeenCalledWith(expect.objectContaining({ target: "slack.chat.post_message", authorization: "xoxb-secret", body: JSON.stringify({ channel: "C123", text: "Hello" }) }));
    expect(result.output).toEqual({ provider: "slack", channel: "C123", providerMessageId: "1710000000.0001" });
    expect(JSON.stringify(result)).not.toContain("xoxb-secret");
    expect(JSON.stringify(result)).not.toContain("Hello");
  });

  it("classifies provider failures narrowly", () => {
    expect(classifySlackFailure({ status: 429 })).toMatchObject({ retryable: true, ambiguous: false });
    expect(classifySlackFailure({ status: 401 })).toMatchObject({ retryable: false, ambiguous: false });
    expect(classifySlackFailure({ status: 503 })).toMatchObject({ retryable: false, ambiguous: true });
    expect(classifySlackFailure({ code: "EGRESS_TIMEOUT" })).toMatchObject({ retryable: false, ambiguous: true });
    expect(classifySlackFailure({ code: "EGRESS_CANCELLED" })).toMatchObject({ retryable: false, ambiguous: false, cancelled: true });
    expect(classifySlackFailure({ code: "EGRESS_CANCELLED_AFTER_DISPATCH" })).toMatchObject({ retryable: false, ambiguous: true });
  });

  it("rejects invalid credentials and provider rejection without persisting raw responses", async () => {
    const egress = vi.fn().mockResolvedValue({ status: 200, providerRequestId: null, body: JSON.stringify({ ok: false, error: "invalid_auth", secret: "do-not-store" }) });
    await expect(slackPostMessageExecutor.execute({ abortSignal: new AbortController().signal, egress } as never, { channel: "C123", text: "Hello" }, { apiToken: "" })).rejects.toMatchObject({ code: "INTEGRATION_CREDENTIAL_INVALID" });
    await expect(slackPostMessageExecutor.execute({ abortSignal: new AbortController().signal, egress } as never, { channel: "C123", text: "Hello" }, { apiToken: "xoxb" })).rejects.toMatchObject({ code: "INTEGRATION_PROVIDER_REJECTED" });
    try { await slackPostMessageExecutor.execute({ abortSignal: new AbortController().signal, egress } as never, { channel: "C123", text: "Hello" }, { apiToken: "xoxb" }); } catch (error) { expect(String(error)).not.toContain("do-not-store"); }
  });

  it("treats an unproven success payload as ambiguous", async () => {
    const egress = vi.fn().mockResolvedValue({ status: 200, providerRequestId: "req-2", body: JSON.stringify({ ok: true, channel: "C123" }) });
    await expect(slackPostMessageExecutor.execute({ abortSignal: new AbortController().signal, egress } as never, { channel: "C123", text: "Hello" }, { apiToken: "xoxb" })).rejects.toMatchObject({ code: "INTEGRATION_PROVIDER_AMBIGUOUS", ambiguous: true, retryable: false });
  });

  it("preserves pre-dispatch cancellation as cancellable", async () => {
    const egress = vi.fn().mockRejectedValue(new IntegrationEgressError("EGRESS_CANCELLED"));
    await expect(slackPostMessageExecutor.execute({ abortSignal: new AbortController().signal, egress } as never, { channel: "C123", text: "Hello" }, { apiToken: "xoxb" })).rejects.toMatchObject({ code: "INTEGRATION_ACTION_CANCELLED", cancelled: true, ambiguous: false });
  });
});
