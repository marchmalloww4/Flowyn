import { describe, expect, it } from "vitest";
import { canEditBrands, filterWorkspaceBrands, type BrandRecord } from "@/lib/client/brands-state";

const brands: BrandRecord[] = [
  { id: "brand-a", workspaceId: "workspace-a", name: "Alpha", description: "A" },
  { id: "brand-b", workspaceId: "workspace-b", name: "Beta", description: "B" },
];

describe("brands presentation state", () => {
  it("filters responses to the selected workspace before rendering", () => {
    expect(filterWorkspaceBrands(brands, "workspace-a").map((brand) => brand.id)).toEqual(["brand-a"]);
    expect(filterWorkspaceBrands(brands, "workspace-missing")).toEqual([]);
  });

  it("shows management affordances only for roles allowed by the existing action map", () => {
    expect(canEditBrands("OWNER")).toBe(true);
    expect(canEditBrands("ADMIN")).toBe(true);
    expect(canEditBrands("MEMBER")).toBe(false);
  });
});
