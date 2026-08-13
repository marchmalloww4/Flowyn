import { describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "@/lib/ai/ollama-provider";

function tagsResponse() {
  return new Response(JSON.stringify({ models: [{ name: "llama3.2:3b" }] }), { status: 200 });
}

function streamResponse() {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"response":"Hello","model":"llama3.2:3b","done":false}\n'));
      controller.enqueue(encoder.encode('{"response":" world","model":"llama3.2:3b","done":true}\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function streamResponseWithoutTrailingNewline() {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"response":"Final","model":"llama3.2:3b","done":true}'));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("native Ollama streaming", () => {
  it("yields chunks from the provider response body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tagsResponse()).mockResolvedValueOnce(streamResponse());
    const provider = new OllamaProvider({ baseUrl: "http://ollama.test", defaultModel: "llama3.2:3b", fetcher });
    const chunks: string[] = [];

    for await (const chunk of provider.stream({ prompt: "Say hello" })) chunks.push(chunk.text);

    expect(chunks).toEqual(["Hello", " world"]);
    expect(fetcher).toHaveBeenLastCalledWith("http://ollama.test/api/generate", expect.objectContaining({ body: expect.stringContaining('"stream":true') }));
  });

  it("flushes a final JSON chunk when the provider omits a trailing newline", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tagsResponse()).mockResolvedValueOnce(streamResponseWithoutTrailingNewline());
    const provider = new OllamaProvider({ baseUrl: "http://ollama.test", defaultModel: "llama3.2:3b", fetcher });

    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.stream({ prompt: "Say hello" })) chunks.push(chunk);
    expect(chunks).toEqual([expect.objectContaining({ text: "Final", done: true })]);
  });
});
