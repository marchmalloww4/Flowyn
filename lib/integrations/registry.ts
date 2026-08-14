import { z } from "zod";
import { integrationSecretMaterialSchema, slackPostMessageInputSchema, slackPostMessageOutputSchema } from "@/lib/integrations/validation";
import type { ConnectorDefinition, ConnectorId, ConnectorOperationDefinition, IntegrationCatalogEntry, IntegrationSecretMaterial, SlackPostMessageInput, SlackPostMessageOutput } from "@/lib/integrations/types";
import { slackPostMessageExecutor } from "@/lib/integrations/slack";

const slackPostMessageOperation: ConnectorOperationDefinition<SlackPostMessageInput, SlackPostMessageOutput> = {
  id: "post_message",
  displayName: "Post message",
  inputSchema: slackPostMessageInputSchema,
  outputSchema: slackPostMessageOutputSchema,
  risk: "EXTERNAL_SIDE_EFFECT",
  requiresApproval: true,
  retryPolicy: {
    maxProviderRetries: 1,
    retryableStatusCodes: [429],
    ambiguousStatusCodes: [500, 502, 503, 504],
  },
  executor: slackPostMessageExecutor,
};

const slackConnector: ConnectorDefinition = {
  id: "slack",
  displayName: "Slack",
  authType: "API_TOKEN",
  credentialSchema: integrationSecretMaterialSchema,
  operations: {
    post_message: slackPostMessageOperation as ConnectorOperationDefinition<unknown, unknown>,
  },
};

const connectors: Record<ConnectorId, ConnectorDefinition> = { slack: slackConnector };

export function getConnectorDefinition(id: string): ConnectorDefinition {
  const connector = connectors[id as ConnectorId];
  if (!connector) throw new Error("Integration connector is not supported.");
  return connector;
}

export function getConnectorOperation(connectorId: string, operationId: string): ConnectorOperationDefinition<unknown, unknown> {
  const operation = getConnectorDefinition(connectorId).operations[operationId as "post_message"];
  if (!operation) throw new Error("Integration operation is not supported.");
  return operation;
}

export function getIntegrationCatalog(): IntegrationCatalogEntry[] {
  return Object.values(connectors).map((connector) => ({
    id: connector.id,
    displayName: connector.displayName,
    authType: connector.authType,
    operations: Object.values(connector.operations).map((operation) => ({
      id: operation.id,
      displayName: operation.displayName,
      risk: operation.risk,
      requiresApproval: operation.requiresApproval,
    })),
  }));
}

export function parseConnectorSecret(connectorId: string, material: unknown): IntegrationSecretMaterial {
  return getConnectorDefinition(connectorId).credentialSchema.parse(material) as IntegrationSecretMaterial;
}

export const connectorIdSchema = z.literal("slack");
export const connectorOperationIdSchema = z.literal("post_message");
