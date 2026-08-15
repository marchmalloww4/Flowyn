import { describe, expect, it } from "vitest";
import { aiStreamStatus, isValidBrandSelection } from "@/lib/client/ai-state";

describe("AI presentation state", () => {
  it("maps lifecycle events to safe, non-provider-specific announcements", () => {
    expect(aiStreamStatus("start")).toBe("Generation started.");
    expect(aiStreamStatus("complete")).toBe("Generation complete.");
    expect(aiStreamStatus("cancel")).toBe("Generation cancelled.");
    expect(aiStreamStatus("provider")).toBe("The AI provider is temporarily unavailable. Try again later.");
    expect(aiStreamStatus("unknown")).toBe("The AI operation could not be completed.");
  });

  it("accepts brand context only when the brand belongs to the selected workspace", () => {
    expect(isValidBrandSelection("workspace-a", "brand-a", [{ id: "brand-a", workspaceId: "workspace-a" }])).toBe(true);
    expect(isValidBrandSelection("workspace-a", "brand-b", [{ id: "brand-b", workspaceId: "workspace-b" }])).toBe(false);
    expect(isValidBrandSelection("workspace-a", null, [])).toBe(true);
  });
});
