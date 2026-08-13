import { describe, expect, it } from "vitest";
import { aiGenerationRequestSchema } from "@/lib/ai/validation";

describe("AI generation request validation", () => {
  it("requires a workspace and rejects client model or endpoint fields", () => {
    expect(() => aiGenerationRequestSchema.parse({ prompt: "Hello" })).toThrow();
    expect(() => aiGenerationRequestSchema.parse({ workspaceId: "11111111-1111-4111-8111-111111111111", prompt: "Hello", model: "secret-model" })).toThrow();
    expect(() => aiGenerationRequestSchema.parse({ workspaceId: "11111111-1111-4111-8111-111111111111", prompt: "Hello", baseUrl: "http://attacker.test" })).toThrow();
    const parsed = aiGenerationRequestSchema.parse({ workspaceId: "11111111-1111-4111-8111-111111111111", prompt: "Hello" });
    expect(parsed).not.toHaveProperty("model");
    expect(parsed).not.toHaveProperty("baseUrl");
    expect(parsed.stream).toBe(false);
  });
});
