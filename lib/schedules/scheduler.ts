import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { processDueSchedules, type ScheduleProcessingMetrics } from "@/lib/schedules/processor";

export const SCHEDULER_HEARTBEAT_KEY = "flowyn:scheduler:heartbeat";

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
  const schedulerId = options.schedulerId ?? "flowyn-scheduler-" + process.pid + "-" + randomUUID().slice(0, 8);
  const pollIntervalMs = options.pollIntervalMs ?? env.SCHEDULER_POLL_INTERVAL_MS;
  const batchSize = options.batchSize ?? env.SCHEDULER_BATCH_SIZE;
  const heartbeatTtlSeconds = options.heartbeatTtlSeconds ?? env.SCHEDULER_HEARTBEAT_TTL_SECONDS;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 300000) throw new Error("Scheduler poll interval is outside the allowed range.");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("Scheduler batch size is outside the allowed range.");
  if (!Number.isInteger(heartbeatTtlSeconds) || heartbeatTtlSeconds < 5 || heartbeatTtlSeconds > 3600) throw new Error("Scheduler heartbeat TTL is outside the allowed range.");

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableReadyCheck: true });
  const processBatch = options.process ?? ((input) => processDueSchedules(input));
  let polling = false;
  let closing = false;
  let activePoll: Promise<void> | undefined;

  const refreshHeartbeat = async () => {
    await redis.set(SCHEDULER_HEARTBEAT_KEY, schedulerId, "EX", heartbeatTtlSeconds);
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
      await activePoll;
      const current = await redis.get(SCHEDULER_HEARTBEAT_KEY);
      if (current === schedulerId) await redis.del(SCHEDULER_HEARTBEAT_KEY);
      await redis.quit();
    },
  };
}
