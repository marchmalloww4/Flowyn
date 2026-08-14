import { Queue } from "bullmq";
import { getQueueConnection } from "@/lib/queue/connection";

export const WORKFLOW_QUEUE_NAME = "flowyn-workflows";

export interface WorkflowJobData {
  runId: string;
}

export function workflowJobId(runId: string, generation = 0): string {
  if (!Number.isInteger(generation) || generation < 0) throw new Error("Workflow dispatch generation must be a nonnegative integer.");
  return generation === 0 ? `workflow-run:${runId}` : `workflow-run:${runId}:generation:${generation}`;
}

export function bullmqWorkflowJobId(runId: string, generation = 0): string {
  return workflowJobId(runId, generation).replaceAll(":", "-");
}

let queue: Queue<WorkflowJobData> | undefined;

export function getWorkflowQueue(): Queue<WorkflowJobData> {
  queue ??= new Queue<WorkflowJobData>(WORKFLOW_QUEUE_NAME, { connection: getQueueConnection() });
  return queue;
}

export async function enqueueWorkflowRun(runId: string, generation = 0): Promise<void> {
  await getWorkflowQueue().add("execute", { runId }, { jobId: bullmqWorkflowJobId(runId, generation), removeOnComplete: 1000, removeOnFail: 5000 });
}

export async function closeWorkflowQueue(): Promise<void> {
  if (!queue) return;
  await queue.close();
  queue = undefined;
}
