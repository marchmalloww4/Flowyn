import { z } from "zod";

export const workspaceInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.").optional(),
});

export const workspacePatchSchema = workspaceInputSchema.partial().refine((input) => Object.keys(input).length > 0, "At least one workspace field is required.");

export type WorkspaceInput = z.infer<typeof workspaceInputSchema>;
export type WorkspacePatch = z.infer<typeof workspacePatchSchema>;

export interface MembershipLike {
  workspaceId: string;
  userId: string;
  role: string;
}

export function assertWorkspaceAccess(memberships: MembershipLike[], userId: string, workspaceId: string): MembershipLike {
  const membership = memberships.find((item) => item.userId === userId && item.workspaceId === workspaceId);
  if (!membership) throw new Error("WORKSPACE_ACCESS_DENIED");
  return membership;
}
