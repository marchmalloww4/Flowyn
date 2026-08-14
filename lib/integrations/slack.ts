import { AppError } from "@/lib/security/errors";
import { executeStaticEgress, IntegrationEgressError, type StaticEgressRequest, type StaticEgressResponse } from "@/lib/integrations/egress";
import { slackPostMessageInputSchema, slackPostMessageOutputSchema } from "@/lib/integrations/validation";
import type { ConnectorExecutor, IntegrationSecretMaterial, SafeIntegrationResult, SlackPostMessageOutput, TrustedIntegrationContext } from "@/lib/integrations/types";
import type { JsonValue } from "@/lib/workflows/types";

export interface ConnectorFailureClassification {
  code: string;
  retryable: boolean;
  ambiguous: boolean;
  cancelled?: boolean;
}

export function classifySlackFailure(responseOrError: { status?: number; code?: string }): ConnectorFailureClassification {
  if (responseOrError.status === 429) return { code: "INTEGRATION_RATE_LIMITED", retryable: true, ambiguous: false };
  if (typeof responseOrError.status === "number" && responseOrError.status >= 500) return { code: "INTEGRATION_PROVIDER_AMBIGUOUS", retryable: false, ambiguous: true };
  if (responseOrError.code === "EGRESS_CANCELLED") return { code: "INTEGRATION_ACTION_CANCELLED", retryable: false, ambiguous: false, cancelled: true };
  if (responseOrError.code === "EGRESS_CANCELLED_AFTER_DISPATCH" || responseOrError.code === "EGRESS_TIMEOUT" || responseOrError.code === "EGRESS_CONNECTION_FAILED" || responseOrError.code === "EGRESS_INVALID_RESPONSE" || responseOrError.code === "EGRESS_RESPONSE_TOO_LARGE") return { code: "INTEGRATION_PROVIDER_AMBIGUOUS", retryable: false, ambiguous: true };
  return { code: "INTEGRATION_PROVIDER_REJECTED", retryable: false, ambiguous: false };
}

export class SlackConnectorError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean, public readonly ambiguous: boolean, public readonly cancelled = false) {
    super("The Slack integration action could not be completed.");
    this.name = "SlackConnectorError";
  }
}

type SlackContext = TrustedIntegrationContext & { egress?: (request: StaticEgressRequest) => Promise<StaticEgressResponse> };

function parseCredential(value: unknown): IntegrationSecretMaterial {
  if (!value || typeof value !== "object" || typeof (value as { apiToken?: unknown }).apiToken !== "string" || !(value as { apiToken: string }).apiToken) throw new AppError("INTEGRATION_CREDENTIAL_INVALID", 409, "The integration credential is invalid.");
  return { apiToken: (value as { apiToken: string }).apiToken };
}

export const slackPostMessageExecutor: ConnectorExecutor = {
  connectorId: "slack",
  operation: "post_message",
  async execute(context: TrustedIntegrationContext, input: unknown, credential: unknown): Promise<SafeIntegrationResult> {
    const parsedInput = slackPostMessageInputSchema.parse(input);
    const parsedCredential = parseCredential(credential);
    const slackContext = context as SlackContext;
    let response: StaticEgressResponse;
    try {
      response = await (slackContext.egress ?? executeStaticEgress)({ target: "slack.chat.post_message", authorization: parsedCredential.apiToken, body: JSON.stringify(parsedInput), signal: context.abortSignal });
    } catch (error) {
      const classification = classifySlackFailure(error instanceof IntegrationEgressError ? { code: error.code } : {});
      throw new SlackConnectorError(classification.code, classification.retryable, classification.ambiguous, classification.cancelled);
    }
    let payload: unknown;
    try { payload = JSON.parse(response.body) as unknown; } catch { throw new SlackConnectorError("INTEGRATION_PROVIDER_AMBIGUOUS", false, true); }
    if (response.status !== 200 || !payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
      const classification = classifySlackFailure({ status: response.status });
      throw new SlackConnectorError(classification.code, classification.retryable, classification.ambiguous);
    }
    const providerPayload = payload as { channel?: unknown; ts?: unknown };
    let output: SlackPostMessageOutput;
    try {
      output = slackPostMessageOutputSchema.parse({ provider: "slack", channel: typeof providerPayload.channel === "string" ? providerPayload.channel : parsedInput.channel, providerMessageId: providerPayload.ts });
    } catch {
      throw new SlackConnectorError("INTEGRATION_PROVIDER_AMBIGUOUS", false, true);
    }
    return { output: output as unknown as JsonValue, providerRequestId: response.providerRequestId, safeMetadata: { provider: "slack", operation: "post_message", status: response.status, retryAfterSeconds: response.retryAfterSeconds } };
  },
};

export const slackConnectorDefinition = {
  id: "slack" as const,
  displayName: "Slack",
  authType: "API_TOKEN" as const,
  operation: slackPostMessageExecutor,
};
