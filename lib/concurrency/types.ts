import type { WorkspaceConcurrencyOperation } from "@/lib/database";

export type { WorkspaceConcurrencyOperation };

export interface WorkspaceReservation {
  id: string;
  workspaceId: string;
  operationClass: WorkspaceConcurrencyOperation;
  sourceId: string;
  ownerId: string;
  expiresAt: Date;
  releasedAt: Date | null;
}
