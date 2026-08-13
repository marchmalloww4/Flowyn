import { describe, expect, it } from "vitest";
import { sanitizeMetadata } from "@/lib/knowledge/metadata";

describe("knowledge metadata", () => {
  it("keeps bounded scalar metadata and removes secret-like keys", () => {
    expect(sanitizeMetadata({
      source: "manual",
      page: 3,
      verified: true,
      apiKey: "do-not-store",
      password: "do-not-store",
    })).toEqual({ source: "manual", page: 3, verified: true });
  });

  it("drops unsupported nested or oversized values", () => {
    expect(sanitizeMetadata({ nested: { value: "no" }, long: "x".repeat(5000) })).toEqual({});
  });
});
