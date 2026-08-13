import { createHash } from "node:crypto";
import { getKnowledgeConfig } from "@/lib/knowledge/config";

export const DEFAULT_CHUNK_SIZE = 1200;
export const DEFAULT_CHUNK_OVERLAP = 150;

export interface KnowledgeChunk {
  index: number;
  content: string;
  stableKey: string;
}

function validateOptions(chunkSize: number, overlap: number): void {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new Error("Chunk size must be a positive integer.");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) throw new Error("Chunk overlap must be a non-negative integer smaller than chunk size.");
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function splitParagraph(paragraph: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < paragraph.length) {
    const targetEnd = Math.min(start + chunkSize, paragraph.length);
    let end = targetEnd;
    if (targetEnd < paragraph.length) {
      const boundary = paragraph.slice(start, targetEnd).search(/\s(?=[^\s]*$)/);
      if (boundary > Math.floor(chunkSize / 2)) end = start + boundary;
    }
    const value = paragraph.slice(start, end).trim();
    if (value) chunks.push(value);
    if (end >= paragraph.length) break;
    const nextStart = Math.max(start + 1, end - overlap);
    start = nextStart;
  }
  return chunks;
}

export function chunkDocument(content: string, options: { chunkSize?: number; overlap?: number; documentId?: string } = {}): KnowledgeChunk[] {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("Knowledge documents must contain content.");
  const config = getKnowledgeConfig();
  const chunkSize = options.chunkSize ?? config.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? config.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;
  validateOptions(chunkSize, overlap);
  const documentId = options.documentId ?? "document";
  const values = normalized.split(/\n\s*\n/).flatMap((paragraph) => splitParagraph(paragraph.trim(), chunkSize, overlap));
  return values.map((value, index) => ({ index, content: value, stableKey: `${documentId}:${index}:${contentHash(value)}` }));
}
