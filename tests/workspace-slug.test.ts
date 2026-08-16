import { describe, expect, it } from "vitest";
import { slugSuggestion } from "@/lib/workspaces/slug";

describe("workspace slug suggestions", () => {
  it("creates a valid suggestion from a workspace name", () => {
    expect(slugSuggestion("SweetBites Bakery")).toBe("sweetbites-bakery");
    expect(slugSuggestion("  Kuala Lumpur / Selangor  ")).toBe("kuala-lumpur-selangor");
  });

  it("keeps the suggestion inside the existing maximum length", () => {
    expect(slugSuggestion("A".repeat(100))).toHaveLength(60);
  });
});
