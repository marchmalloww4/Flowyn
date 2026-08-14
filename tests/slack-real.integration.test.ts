import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { slackPostMessageExecutor } from "@/lib/integrations/slack";

const real = process.env.RUN_SLACK_INTEGRATION === "1" ? describe : describe.skip;
const token = process.env.INTEGRATION_TEST_SLACK_TOKEN;
const channel = process.env.INTEGRATION_TEST_SLACK_CHANNEL;
const previousEgress = process.env.INTEGRATION_EGRESS_ENABLED;

real("opt-in real Slack integration", () => {
  afterAll(() => {
    if (previousEgress === undefined) delete process.env.INTEGRATION_EGRESS_ENABLED;
    else process.env.INTEGRATION_EGRESS_ENABLED = previousEgress;
    resetEnvForTests();
  });

  it("posts only the bounded test message through the fixed connector", async () => {
    if (!token || !channel) throw new Error("RUN_SLACK_INTEGRATION=1 requires INTEGRATION_TEST_SLACK_TOKEN and INTEGRATION_TEST_SLACK_CHANNEL.");
    process.env.INTEGRATION_EGRESS_ENABLED = "true";
    resetEnvForTests();
    const result = await slackPostMessageExecutor.execute({
      workspaceId: "real-slack-test",
      workflowRunId: randomUUID(),
      workflowStepId: "slack-real-test",
      workflowStepRunId: randomUUID(),
      idempotencyKey: randomUUID(),
      abortSignal: new AbortController().signal,
    }, { channel, text: `Flowyn opt-in integration verification ${new Date().toISOString()}` }, { apiToken: token });
    expect(result.output).toMatchObject({ provider: "slack", channel });
    expect(JSON.stringify(result)).not.toContain(token);
  }, 30000);
});
