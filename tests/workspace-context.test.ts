import { describe, expect, it } from "vitest";
import {
  createWorkspaceRequestController,
  resolveWorkspaceSelection,
  type WorkspaceMembership,
} from "@/lib/client/workspace-state";

const memberships: WorkspaceMembership[] = [
  { role: "OWNER", workspace: { id: "workspace-a", name: "Alpha", slug: "alpha" } },
  { role: "MEMBER", workspace: { id: "workspace-b", name: "Beta", slug: "beta" } },
];

describe("workspace selection state", () => {
  it("accepts a valid URL selection before a stored selection", () => {
    expect(resolveWorkspaceSelection(memberships, "workspace-b", "workspace-a")?.workspace.id).toBe("workspace-b");
  });

  it("uses a valid stored selection when the URL has no valid selection", () => {
    expect(resolveWorkspaceSelection(memberships, "deleted", "workspace-b")?.workspace.id).toBe("workspace-b");
  });

  it("falls back to the first membership and returns null when none exist", () => {
    expect(resolveWorkspaceSelection(memberships, "deleted", "also-deleted")?.workspace.id).toBe("workspace-a");
    expect(resolveWorkspaceSelection([], "workspace-a", "workspace-b")).toBeNull();
  });

  it("aborts the previous request and invalidates stale generations on switch", () => {
    const controller = createWorkspaceRequestController();
    const first = controller.begin();
    const second = controller.begin();

    expect(first.signal.aborted).toBe(true);
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);

    controller.invalidate();
    expect(second.signal.aborted).toBe(true);
    expect(controller.isCurrent(second.generation)).toBe(false);
  });
});
