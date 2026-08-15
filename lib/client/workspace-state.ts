export type Workspace = { id: string; name: string; slug: string };

export type WorkspaceMembership = {
  role: string;
  workspace: Workspace;
};

export function resolveWorkspaceSelection(
  memberships: WorkspaceMembership[],
  requestedId?: string | null,
  storedId?: string | null,
): WorkspaceMembership | null {
  const validIds = [requestedId, storedId].filter((id): id is string => Boolean(id));
  for (const id of validIds) {
    const match = memberships.find((membership) => membership.workspace.id === id);
    if (match) return match;
  }
  return memberships[0] ?? null;
}

export function createWorkspaceRequestController() {
  let generation = 0;
  let activeController: AbortController | null = null;

  return {
    begin() {
      activeController?.abort();
      activeController = new AbortController();
      generation += 1;
      return { generation, signal: activeController.signal };
    },
    invalidate() {
      activeController?.abort();
      activeController = null;
      generation += 1;
    },
    isCurrent(candidate: number) {
      return candidate === generation && activeController !== null && !activeController.signal.aborted;
    },
  };
}
