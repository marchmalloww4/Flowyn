import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/ai/prompt";

describe("AI prompt builder", () => {
  it("composes instructions, context, brand context, and output requirements deterministically", () => {
    const result = buildPrompt({
      systemInstructions: "Be concise.",
      userInstructions: "Write a welcome message.",
      context: "The customer just joined.",
      brandContext: { name: "Acme", tone: "clear and warm", targetAudience: "new customers" },
      outputRequirements: "Return one paragraph.",
    });

    expect(result.system).toContain("Be concise.");
    expect(result.prompt).toContain("Write a welcome message.");
    expect(result.prompt).toContain("Acme");
    expect(result.prompt).toContain("clear and warm");
    expect(result.prompt).toContain("Return one paragraph.");
    expect(result.totalChars).toBe(result.system.length + result.prompt.length);
  });

  it("preserves the Milestone 3 prompt contract when RAG is disabled", () => {
    const result = buildPrompt({
      userInstructions: "Write a welcome message.",
      brandContext: { name: "Acme", tone: "clear" },
    });

    expect(result.system).toBe("");
    expect(result.prompt).toBe("User instructions:\nWrite a welcome message.\n\nBrand context:\nName: Acme\nTone: clear");
  });
});
