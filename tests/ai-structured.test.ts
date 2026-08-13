import { describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "@/lib/ai/ollama-provider";
import { AIError } from "@/lib/ai/errors";
import { z } from "zod";

function tagsResponse() {
  return new Response(JSON.stringify({ models: [{ name: "llama3.2:3b" }] }), { status: 200 });
}

describe("structured AI generation", () => {
  it("parses JSON and validates it with the caller schema", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tagsResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ response: JSON.stringify({ title: "Hello" }), model: "llama3.2:3b", done: true }), { status: 200 }));
    const provider = new OllamaProvider({ baseUrl: "http://ollama.test", defaultModel: "llama3.2:3b", fetcher });

    await expect(provider.generateStructured({ prompt: "Return JSON", schema: z.object({ title: z.string() }) })).resolves.toMatchObject({ value: { title: "Hello" } });
  });

  it("rejects malformed model JSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tagsResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ response: "not-json", model: "llama3.2:3b", done: true }), { status: 200 }));
    const provider = new OllamaProvider({ baseUrl: "http://ollama.test", defaultModel: "llama3.2:3b", fetcher });

    const result = provider.generateStructured({ prompt: "Return JSON", schema: z.object({ title: z.string() }) });
    await expect(result).rejects.toMatchObject({ code: "INVALID_STRUCTURED_OUTPUT" });
    await expect(result).rejects.toBeInstanceOf(AIError);
  });
});
