import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWebhookSignature, buildSignedMessage } from "@/lib/webhooks/protocol";
import { workflowWebhookEvents, workflows } from "@/lib/database/schema";

const mocks = vi.hoisted(() => ({
  getTrigger: vi.fn(),
  decryptSecret: vi.fn(),
  createRun: vi.fn(),
  rateLimit: vi.fn(),
  eventExpiry: vi.fn(),
  admitAcceptedWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/webhooks/repository", () => ({ getWebhookTriggerByPublicId: mocks.getTrigger }));
vi.mock("@/lib/webhooks/service", () => ({ decryptActiveWebhookSecret: mocks.decryptSecret, webhookEventExpiry: mocks.eventExpiry }));
vi.mock("@/lib/webhooks/rate-limit", () => ({ consumeWebhookRateLimit: mocks.rateLimit }));
vi.mock("@/lib/workflows/service", () => ({ createWebhookWorkflowRun: mocks.createRun }));
vi.mock("@/lib/usage/service", () => ({ admitAcceptedWebhook: mocks.admitAcceptedWebhook }));

import { ingestWebhookDelivery } from "@/lib/webhooks/ingress";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const triggerId = "33333333-3333-4333-8333-333333333333";
const eventDbId = "44444444-4444-4444-8444-444444444444";
const runId = "55555555-5555-4555-8555-555555555555";
const secret = "whsec_test-secret";
const trigger = { id: triggerId, workspaceId, workflowId, publicId: "public-id", enabled: true, deletedAt: null, secretKeyVersion: "v1", secretVersion: 1, secretCiphertext: "ciphertext" };
const workflow = { id: workflowId, workspaceId, enabled: true, deletedAt: null };

function requestParts(body = Buffer.from('{"event":"publish"}')) {
  const timestamp = "1700000000";
  return { timestamp, body, signature: createWebhookSignature(secret, buildSignedMessage(timestamp, body)) };
}

function database(options: { duplicate?: boolean; workflowEnabled?: boolean } = {}) {
  const event = { id: eventDbId, workspaceId, triggerId, status: "TRIGGERED", workflowRunId: runId };
  const tx = {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(options.duplicate ? [] : [event]) }) }) }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockImplementation((table) => {
      if (table === workflows) return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ ...workflow, enabled: options.workflowEnabled ?? true }]) }) };
      if (table === workflowWebhookEvents) return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([event]) }) };
      return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
    }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([event]) }) }) }),
  };
  return { transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), tx };
}

describe("public webhook ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTrigger.mockResolvedValue(trigger);
    mocks.decryptSecret.mockReturnValue(secret);
    mocks.createRun.mockResolvedValue({ id: runId, workspaceId, workflowId });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.eventExpiry.mockReturnValue(new Date("2026-09-13T00:00:00.000Z"));
  });

  it("authenticates and durably accepts before returning", async () => {
    const parts = requestParts();
    const result = await ingestWebhookDelivery({
      publicId: trigger.publicId,
      timestamp: parts.timestamp,
      signature: parts.signature,
      eventId: "delivery-1",
      contentType: "application/json",
      rawBody: parts.body,
      now: new Date(1700000000 * 1000),
      db: database() as never,
      redis: {} as never,
    });
    expect(result).toEqual({ accepted: true, duplicate: false });
    expect(mocks.admitAcceptedWebhook).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, sourceType: "WEBHOOK_EVENT", sourceId: eventDbId, operationKey: expect.stringContaining(`webhook:${triggerId}`) }));
    expect(mocks.createRun).toHaveBeenCalledWith(expect.objectContaining({ webhookTriggerId: triggerId, webhookEventId: eventDbId, input: { event: "publish" } }), expect.anything());
  });

  it("returns duplicate acceptance without creating another run", async () => {
    const parts = requestParts();
    const result = await ingestWebhookDelivery({ publicId: trigger.publicId, timestamp: parts.timestamp, signature: parts.signature, eventId: "delivery-1", contentType: "application/json", rawBody: parts.body, now: new Date(1700000000 * 1000), db: database({ duplicate: true }) as never, redis: {} as never });
    expect(result).toEqual({ accepted: true, duplicate: true });
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.admitAcceptedWebhook).not.toHaveBeenCalled();
  });

  it("rejects a forged signature before opening a database transaction", async () => {
    const parts = requestParts();
    const db = database();
    await expect(ingestWebhookDelivery({ publicId: trigger.publicId, timestamp: parts.timestamp, signature: "v1=" + "0".repeat(64), eventId: "delivery-1", contentType: "application/json", rawBody: parts.body, now: new Date(1700000000 * 1000), db: db as never, redis: {} as never })).rejects.toMatchObject({ code: "WEBHOOK_REJECTED", status: 401 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("records a valid delivery as skipped when the workflow is disabled", async () => {
    const parts = requestParts();
    const db = database({ workflowEnabled: false });
    await expect(ingestWebhookDelivery({ publicId: trigger.publicId, timestamp: parts.timestamp, signature: parts.signature, eventId: "delivery-2", contentType: "application/json", rawBody: parts.body, now: new Date(1700000000 * 1000), db: db as never, redis: {} as never })).resolves.toEqual({ accepted: true, duplicate: false });
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.admitAcceptedWebhook).toHaveBeenCalledTimes(1);
  });
});
