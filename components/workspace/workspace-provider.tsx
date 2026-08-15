"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import {
  createWorkspaceRequestController,
  resolveWorkspaceSelection,
  type Workspace,
  type WorkspaceMembership,
} from "@/lib/client/workspace-state";
import { LiveRegion } from "@/components/ui/live-region";

const STORAGE_KEY = "flowyn:selected-workspace";

type WorkspaceContextValue = {
  memberships: WorkspaceMembership[];
  selectedMembership: WorkspaceMembership | null;
  selectedWorkspace: Workspace | null;
  selectedWorkspaceId: string | null;
  workspaceEpoch: number;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => void;
  beginWorkspaceRequest: () => { generation: number; signal: AbortSignal };
  isCurrentWorkspaceRequest: (generation: number) => boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readBrowserWorkspaceId() {
  if (typeof window === "undefined") return { requestedId: null, storedId: null };
  const requestedId = new URLSearchParams(window.location.search).get("workspaceId");
  let storedId: string | null = null;
  try {
    storedId = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    storedId = null;
  }
  return { requestedId, storedId };
}

export function WorkspaceProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const requestController = useRef(createWorkspaceRequestController());
  const hasLoaded = useRef(false);
  const selectedWorkspaceIdRef = useRef<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    const request = requestController.current.begin();
    setIsLoading(true);
    setError(null);
    try {
      const body = await apiRequest<{ workspaces: WorkspaceMembership[] }>("/api/workspaces", { cache: "no-store", signal: request.signal });
      if (!requestController.current.isCurrent(request.generation)) return;

      const nextMemberships = body.workspaces.filter((membership) => membership?.workspace?.id && membership.workspace.name);
      const browserSelection = readBrowserWorkspaceId();
      const nextSelection = resolveWorkspaceSelection(nextMemberships, hasLoaded.current ? selectedWorkspaceIdRef.current : browserSelection.requestedId, hasLoaded.current ? null : browserSelection.storedId);
      const nextId = nextSelection?.workspace.id ?? null;
      const previousId = selectedWorkspaceIdRef.current;
      setMemberships(nextMemberships);
      setSelectedWorkspaceId(nextId);
      selectedWorkspaceIdRef.current = nextId;
      setWorkspaceEpoch((current) => current + 1);
      hasLoaded.current = true;
      if (nextId && nextId !== previousId) setAnnouncement(`Workspace changed to ${nextSelection?.workspace.name ?? "the selected workspace"}.`);
      if (!nextId) setAnnouncement("No workspaces are available. Create a workspace to get started.");
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
      if (caughtError instanceof FlowynClientError) setError(caughtError.details.message);
      else setError("Workspaces could not be loaded. Try again.");
    } finally {
      if (requestController.current.isCurrent(request.generation)) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = requestController.current;
    void loadWorkspaces();
    return () => controller.invalidate();
  }, [loadWorkspaces]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    const membership = memberships.find((candidate) => candidate.workspace.id === workspaceId);
    if (!membership || workspaceId === selectedWorkspaceId) return;
    requestController.current.invalidate();
    setSelectedWorkspaceId(workspaceId);
    selectedWorkspaceIdRef.current = workspaceId;
    setWorkspaceEpoch((current) => current + 1);
    setAnnouncement(`Workspace changed to ${membership.workspace.name}.`);
    try {
      window.localStorage.setItem(STORAGE_KEY, workspaceId);
    } catch {
      // A browser storage policy must not prevent workspace navigation.
    }
  }, [memberships, selectedWorkspaceId]);

  const beginWorkspaceRequest = useCallback(() => requestController.current.begin(), []);
  const isCurrentWorkspaceRequest = useCallback((generation: number) => requestController.current.isCurrent(generation), []);
  const selectedMembership = memberships.find((membership) => membership.workspace.id === selectedWorkspaceId) ?? null;
  const selectedWorkspace = selectedMembership?.workspace ?? null;
  const value = useMemo<WorkspaceContextValue>(() => ({
    beginWorkspaceRequest,
    error,
    isCurrentWorkspaceRequest,
    isLoading,
    memberships,
    reload: loadWorkspaces,
    selectWorkspace,
    selectedMembership,
    selectedWorkspace,
    selectedWorkspaceId,
    workspaceEpoch,
  }), [beginWorkspaceRequest, error, isCurrentWorkspaceRequest, isLoading, loadWorkspaces, memberships, selectWorkspace, selectedMembership, selectedWorkspace, selectedWorkspaceId, workspaceEpoch]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      <LiveRegion mode="polite">{announcement}</LiveRegion>
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return context;
}
