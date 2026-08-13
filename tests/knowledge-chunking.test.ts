import { describe, expect, it } from "vitest";
import { chunkDocument } from "@/lib/knowledge/chunking";

describe("document chunking", () => {
  it("produces deterministic chunks and stable keys", () => {
    const content = "First paragraph with enough words.\n\nSecond paragraph with enough words.";
    const first = chunkDocument(content, { chunkSize: 32, overlap: 6, documentId: "doc-1" });
    const second = chunkDocument(content, { chunkSize: 32, overlap: 6, documentId: "doc-1" });

    expect(first).toEqual(second);
    expect(first.every((chunk) => chunk.stableKey.startsWith("doc-1:"))).toBe(true);
  });

  it("does not merge separate short paragraphs into an arbitrary boundary", () => {
    const chunks = chunkDocument("Alpha paragraph.\n\nBeta paragraph.", { chunkSize: 20, overlap: 0, documentId: "doc-2" });

    expect(chunks.map((chunk) => chunk.content)).toEqual(["Alpha paragraph.", "Beta paragraph."]);
  });

  it("applies bounded overlap when a paragraph must be split", () => {
    const chunks = chunkDocument("abcdefghijklmnopqrstuvwxyz", { chunkSize: 10, overlap: 3, documentId: "doc-3" });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]?.content.startsWith(chunks[0]?.content.slice(-3) ?? "")).toBe(true);
  });

  it("orders chunks stably and never emits a duplicate stable key", () => {
    const chunks = chunkDocument("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda", { chunkSize: 16, overlap: 4, documentId: "doc-4" });

    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_chunk, index) => index));
    expect(new Set(chunks.map((chunk) => chunk.stableKey)).size).toBe(chunks.length);
  });

  it("rejects empty documents and invalid overlap", () => {
    expect(() => chunkDocument("  ")).toThrow();
    expect(() => chunkDocument("content", { chunkSize: 10, overlap: 10 })).toThrow();
  });
});
