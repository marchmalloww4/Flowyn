import type { WorkspacePlan } from "@/lib/usage/types";

export function resolveWorkspacePlan(workspaceId: string): WorkspacePlan {
  void workspaceId;
  return "SELF_HOSTED";
}
