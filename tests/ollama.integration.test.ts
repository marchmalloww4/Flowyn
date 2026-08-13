import { describe, expect, it } from "vitest";
import { OllamaProvider } from "@/lib/ai/ollama-provider";

const integration = process.env.RUN_OLLAMA_INTEGRATION === "1" ? describe : describe.skip;

integration("local Ollama integration", () => {
  it("performs a real generation with the configured model", async () => {
    const result = await new OllamaProvider().generate({ prompt: "Reply with one short friendly greeting.", maxTokens: 32 });
    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.model).toBe("llama3.2:3b");
  }, 120000);
});
