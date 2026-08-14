import { describe, expect, it } from "vitest";
import { integrationActionConfigSchema, slackPostMessageInputSchema } from "@/lib/integrations/validation";

describe("integration validation", () => {
  it("accepts bounded Slack post_message input and rejects unsafe values", () => {
    expect(slackPostMessageInputSchema.parse({ channel: "C123", text: "Hello" })).toEqual({ channel: "C123", text: "Hello" });
    expect(slackPostMessageInputSchema.safeParse({ channel: "", text: "Hello" }).success).toBe(false);
    expect(slackPostMessageInputSchema.safeParse({ channel: "C123", text: "Hello\nWorld" }).success).toBe(false);
    expect(slackPostMessageInputSchema.safeParse({ channel: "C123", text: "x".repeat(12001) }).success).toBe(false);
    expect(slackPostMessageInputSchema.safeParse({ channel: "C123" }).success).toBe(false);
    expect(slackPostMessageInputSchema.safeParse({ channel: "C123", text: "Hello", token: "secret" }).success).toBe(false);
    expect(slackPostMessageInputSchema.safeParse({ channel: "C123", text: 42 }).success).toBe(false);
  });

  it("accepts only the closed Slack workflow action shape", () => {
    const valid = {
      connectorId: "slack",
      credentialId: "00000000-0000-4000-8000-000000000000",
      operation: "post_message",
      input: {
        channel: { kind: "literal", value: "C123" },
        text: { kind: "reference", path: "steps.prepare.output" },
      },
    };

    expect(integrationActionConfigSchema.parse(valid)).toEqual(valid);
    for (const field of ["url", "method", "headers", "port", "redirects", "token", "body"]) {
      expect(integrationActionConfigSchema.safeParse({ ...valid, [field]: "forbidden" }).success).toBe(false);
    }
    expect(integrationActionConfigSchema.safeParse({ ...valid, connectorId: "github" }).success).toBe(false);
    expect(integrationActionConfigSchema.safeParse({ ...valid, operation: "send_file" }).success).toBe(false);
  });
});
