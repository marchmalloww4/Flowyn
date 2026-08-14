import { describe, expect, it } from "vitest";
import { actionIdempotencyKey, canTransitionIntegrationAction, transitionIntegrationAction } from "@/lib/integrations/actions";

describe("durable integration action state", () => {
  it("derives a stable logical key from immutable run and step identity", () => {
    expect(actionIdempotencyKey("run-1", "step-1")).toBe(actionIdempotencyKey("run-1", "step-1"));
    expect(actionIdempotencyKey("run-1", "step-1")).not.toBe(actionIdempotencyKey("run-1", "step-2"));
    expect(actionIdempotencyKey("run-1", "step-1")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("allows only the durable state machine transitions", () => {
    expect(canTransitionIntegrationAction("PENDING", "IN_FLIGHT")).toBe(true);
    expect(canTransitionIntegrationAction("IN_FLIGHT", "SUCCEEDED")).toBe(true);
    expect(canTransitionIntegrationAction("IN_FLIGHT", "FAILED")).toBe(true);
    expect(canTransitionIntegrationAction("IN_FLIGHT", "AMBIGUOUS")).toBe(true);
    expect(canTransitionIntegrationAction("IN_FLIGHT", "CANCELLED")).toBe(true);
    expect(canTransitionIntegrationAction("SUCCEEDED", "IN_FLIGHT")).toBe(false);
    expect(canTransitionIntegrationAction("AMBIGUOUS", "SUCCEEDED")).toBe(false);
  });

  it("returns terminal outcomes without retrying ambiguous actions", () => {
    expect(transitionIntegrationAction("PENDING", "claim")).toMatchObject({ status: "IN_FLIGHT" });
    expect(transitionIntegrationAction("IN_FLIGHT", "success")).toMatchObject({ status: "SUCCEEDED" });
    expect(transitionIntegrationAction("IN_FLIGHT", "unknown_provider_outcome")).toMatchObject({ status: "AMBIGUOUS", retryable: false });
    expect(transitionIntegrationAction("IN_FLIGHT", "cancel")).toMatchObject({ status: "CANCELLED", retryable: false });
  });
});
