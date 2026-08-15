import { describe, expect, it } from "vitest";
import { deriveOnboardingState, type OnboardingSnapshot } from "@/lib/client/onboarding-state";

const base: OnboardingSnapshot = {
  hasMembership: true,
  hasBrand: false,
  knowledgeStatuses: [],
  hasUsableAgent: false,
  hasUsableWorkflow: false,
};

describe("server-derived onboarding state", () => {
  it("keeps a new account at workspace setup", () => {
    const state = deriveOnboardingState({ ...base, hasMembership: false });
    expect(state.completed).toBe(false);
    expect(state.nextStage).toBe("workspace");
    expect(state.stages.find((stage) => stage.key === "workspace")?.status).toBe("CURRENT");
  });

  it("advances from workspace to brand without inventing completion", () => {
    const state = deriveOnboardingState(base);
    expect(state.nextStage).toBe("brand");
    expect(state.stages.map((stage) => stage.status)).toEqual(["COMPLETE", "CURRENT", "UPCOMING", "UPCOMING"]);
  });

  it("does not complete knowledge for processing or failed documents", () => {
    const processing = deriveOnboardingState({ ...base, hasBrand: true, knowledgeStatuses: ["PENDING", "PROCESSING", "FAILED"] });
    expect(processing.nextStage).toBe("knowledge");
    expect(processing.stages.find((stage) => stage.key === "knowledge")?.status).toBe("CURRENT");
  });

  it("requires READY knowledge and a usable agent or workflow", () => {
    const state = deriveOnboardingState({ ...base, hasBrand: true, knowledgeStatuses: ["READY"] });
    expect(state.nextStage).toBe("automation");
    expect(state.stages.find((stage) => stage.key === "knowledge")?.status).toBe("COMPLETE");
    expect(state.stages.find((stage) => stage.key === "automation")?.status).toBe("CURRENT");
    expect(deriveOnboardingState({ ...base, hasBrand: true, knowledgeStatuses: ["READY"], hasUsableAgent: true }).completed).toBe(true);
  });

  it("returns a compact completed state and does not let dismissal alter completion", () => {
    const complete = { ...base, hasBrand: true, knowledgeStatuses: ["READY"], hasUsableWorkflow: true };
    expect(deriveOnboardingState(complete, { dismissed: true }).completed).toBe(true);
    expect(deriveOnboardingState(complete, { dismissed: true }).visible).toBe(false);
    expect(deriveOnboardingState({ ...base, hasBrand: true }, { dismissed: true }).completed).toBe(false);
    expect(deriveOnboardingState({ ...base, hasBrand: true }, { dismissed: true }).nextStage).toBe("knowledge");
  });
});
