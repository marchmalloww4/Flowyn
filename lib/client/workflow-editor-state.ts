export function workflowStepAnnouncement(step: { name: string; type: string }, index: number): string {
  return `Step ${index + 1}: ${step.name} (${step.type})`;
}
