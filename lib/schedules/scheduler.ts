import { randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";
import { createSchedulerConnection } from "@/lib/queue/connection";
import { processDueSchedules, type ScheduleProcessingMetrics } from "@/lib/schedules/processor";

export const SCHEDULER_HEARTBEAT_PREFIX = "flowyn:scheduler:heartbeat:";

export function getSchedulerHeartbeatKey(schedulerId: string): string {
  return `${SCHEDULER_HEARTBEAT_PREFIX}${schedulerId.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 64)}`;
}

export interface WorkflowSchedulerOptions {
  schedulerId?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  heartbeatTtlSeconds?: number;
  process?: (options: { batchSize: number }) => Promise<ScheduleProcessingMetrics>;
  cleanup?: () => Promise<number>;
}
export interface WorkflowSchedulerRuntime {
  close(): Promise<void>;
}

function logMetrics(schedulerId: string, metrics: ScheduleProcessingMetrics, durationMs: number): void {
  console.log(JSON.stringify({
    event: "workflow_scheduler.poll",
    schedulerId,
    claimed: metrics.claimed,
    triggered: metrics.triggered,
    skipped: metrics.skipped,
    failed: metrics.failed,
    durationMs,
  }));
}

export async function startWorkflowScheduler(options: WorkflowSchedulerOptions = {}): Promise<WorkflowSchedulerRuntime> {
  const env = getEnv();
  const schedulerId = options.schedulerId ?? getEnv().SCHEDULER_INSTANCE_ID ?? "flowyn-scheduler-" + process.pid + "-" + randomUUID().slice(0, 8);
  const pollIntervalMs = options.pollIntervalMs ?? env.SCHEDULER_POLL_INTERVAL_MS;
  const batchSize = options.batchSize ?? env.SCHEDULER_BATCH_SIZE;
  const heartbeatTtlSeconds = options.heartbeatTtlSeconds ?? env.SCHEDULER_HEARTBEAT_TTL_SECONDS;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 300000) throw new Error("Scheduler poll interval is outside the allowed range.");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("Scheduler batch size is outside the allowed range.");
  if (!Number.isInteger(heartbeatTtlSeconds) || heartbeatTtlSeconds < 5 || heartbeatTtlSeconds > 3600) throw new Error("Scheduler heartbeat TTL is outside the allowed range.");

  const redis = createSchedulerConnection();
  const heartbeatKey = getSchedulerHeartbeatKey(schedulerId);
  const processBatch = options.process ?? ((input) => processDueSchedules(input));
  let polling = false;
  let closing = false;
  let activePoll: Promise<void> | undefined;

  const refreshHeartbeat = async () => {
    await redis.set(heartbeatKey, schedulerId, "EX", heartbeatTtlSeconds);
  };

  const poll = async () => {
    if (polling || closing) return;
    polling = true;
    const startedAt = performance.now();
    try {
      const metrics = await processBatch({ batchSize });
      await refreshHeartbeat();
      if (options.cleanup) {
        try {
          await options.cleanup();
        } catch (error) {
          console.error(JSON.stringify({
            event: "workflow_scheduler.maintenance_failed",
            schedulerId,
            error: error instanceof Error ? error.name : "UnknownError",
          }));
        }
      }
      logMetrics(schedulerId, metrics, Math.max(0, Math.round(performance.now() - startedAt)));
    } catch (error) {
      console.error(JSON.stringify({
        event: "workflow_scheduler.poll_failed",
        schedulerId,
        error: error instanceof Error ? error.name : "UnknownError",
      }));
      try {
        await refreshHeartbeat();
      } catch {
        // Redis health is reflected by the next failed heartbeat check.
      }
    } finally {
      polling = false;
    }
  };

  await redis.ping();
  activePoll = poll();
  await activePoll;
  const timer = setInterval(() => {
    activePoll = poll();
  }, pollIntervalMs);

  return {
    async close() {
      closing = true;
      clearInterval(timer);
      let drained = false;
      try {
        await Promise.race([activePoll, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Scheduler drain timed out.")), getEnv().RUNTIME_SHUTDOWN_TIMEOUT_MS))]);
        drained = true;
      } catch (error) {
        console.error(JSON.stringify({ event: "workflow_scheduler.drain_failed", schedulerId, error: error instanceof Error ? error.name : "UnknownError" }));
      }
      const current = await redis.get(heartbeatKey);
      if (drained && current === schedulerId) await redis.del(heartbeatKey);
      await redis.quit();
    },
  };
}
