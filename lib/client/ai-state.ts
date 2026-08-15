type BrandSelection = { id: string; workspaceId: string };

export function isValidBrandSelection(workspaceId: string | null, brandId: string | null, brands: BrandSelection[]): boolean {
  if (!brandId) return true;
  return Boolean(workspaceId && brands.some((brand) => brand.id === brandId && brand.workspaceId === workspaceId));
}

export function aiStreamStatus(event: "start" | "complete" | "cancel" | "provider" | "unknown"): string {
  if (event === "start") return "Generation started.";
  if (event === "complete") return "Generation complete.";
  if (event === "cancel") return "Generation cancelled.";
  if (event === "provider") return "The AI provider is temporarily unavailable. Try again later.";
  return "The AI operation could not be completed.";
}
