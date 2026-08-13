import { z } from "zod";
import { WORKSPACE_ROLES } from "@/lib/workspaces/roles";

export const workspaceRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES),
});

export const addMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type WorkspaceRoleInput = z.infer<typeof workspaceRoleSchema>;
