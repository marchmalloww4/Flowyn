export type BrandRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
};

export function filterWorkspaceBrands(brands: BrandRecord[], workspaceId: string): BrandRecord[] {
  return brands.filter((brand) => brand.workspaceId === workspaceId);
}

export function canEditBrands(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}
