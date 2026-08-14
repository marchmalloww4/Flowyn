import { Queue } from "bullmq";
import { getQueueConnection } from "@/lib/queue/connection";

export const WORKFLOW_QUEUE_NAME = "flowyn-workflows";

export interface WorkflowJobData {
  runId: string;
}

export function workflowJobId(runId: string): string {
  return `workflow-run:${runId}`;
}

export function bullmqWorkflowJobId(runId: string): string {
  return workflowJobId(runId).replace(":", "-");
}

let queue: Queue<WorkflowJobData> | undefined;

export function getWorkflowQueue(): Queue<WorkflowJobData> {
  queue ??= new Queue<WorkflowJobData>(WORKFLOW_QUEUE_NAME, { connection: getQueueConnection() });
  return queue;
}

export async function enqueueWorkflowRun(runId: string): Promise<void> {
  await getWorkflowQueue().add("execute", { runId }, { jobId: bullmqWorkflowJobId(runId), removeOnComplete: 1000, removeOnFail: 5000 });
}

export async function closeWorkflowQueue(): Promise<void> {
  if (!queue) return;
  await queue.close();
  queue = undefined;
}
