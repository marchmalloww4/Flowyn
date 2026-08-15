export type OnboardingStageKey = "workspace" | "brand" | "knowledge" | "automation";
export type OnboardingStageStatus = "COMPLETE" | "CURRENT" | "UPCOMING";

export type OnboardingSnapshot = {
  hasMembership: boolean;
  hasBrand: boolean;
  knowledgeStatuses: string[];
  hasUsableAgent: boolean;
  hasUsableWorkflow: boolean;
};

export type OnboardingStage = {
  key: OnboardingStageKey;
  label: string;
  description: string;
  status: OnboardingStageStatus;
};

export type OnboardingState = {
  completed: boolean;
  nextStage: OnboardingStageKey | null;
  stages: OnboardingStage[];
  visible: boolean;
};

const stageDefinitions: Array<{ key: OnboardingStageKey; label: string; description: string }> = [
  { key: "workspace", label: "Create or join a workspace", description: "Set the secure boundary where your work is kept." },
  { key: "brand", label: "Add a brand", description: "Give Flowyn the brand context used by your team and AI tools." },
  { key: "knowledge", label: "Index ready knowledge", description: "Add bounded text and wait until at least one document is READY." },
  { key: "automation", label: "Enable an agent or workflow", description: "Prepare one usable automation for the next task." },
];

export function deriveOnboardingState(snapshot: OnboardingSnapshot, options: { dismissed?: boolean } = {}): OnboardingState {
  const complete = [
    snapshot.hasMembership,
    snapshot.hasBrand,
    snapshot.knowledgeStatuses.some((status) => status === "READY"),
    snapshot.hasUsableAgent || snapshot.hasUsableWorkflow,
  ];
  const firstIncomplete = complete.findIndex((value) => !value);
  const completed = firstIncomplete === -1;
  const stages = stageDefinitions.map((definition, index) => ({
    ...definition,
    status: complete[index] ? "COMPLETE" as const : index === firstIncomplete ? "CURRENT" as const : "UPCOMING" as const,
  }));

  return {
    completed,
    nextStage: completed ? null : stageDefinitions[firstIncomplete]?.key ?? null,
    stages,
    visible: !options.dismissed && !completed,
  };
}
