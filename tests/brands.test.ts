import { describe, expect, it } from "vitest";
import { brandInputSchema } from "@/lib/brands/validation";
import { canPerformWorkspaceAction } from "@/lib/authz/authorization";

describe("brand input", () => {
  it("applies safe defaults to optional brand DNA fields", () => {
    const brand = brandInputSchema.parse({ workspaceId: "00000000-0000-0000-0000-000000000000", name: "Acme AI" });
    expect(brand.preferredVocabulary).toEqual([]);
    expect(brand.forbiddenVocabulary).toEqual([]);
    expect(brand.description).toBe("");
  });

  it("rejects a brand without a valid workspace id", () => {
    expect(() => brandInputSchema.parse({ workspaceId: "other", name: "Acme AI" })).toThrow();
  });

  it("allows admins to write brands but keeps members read-only", () => {
    expect(canPerformWorkspaceAction("ADMIN", "brand.write")).toBe(true);
    expect(canPerformWorkspaceAction("MEMBER", "brand.write")).toBe(false);
  });
});
