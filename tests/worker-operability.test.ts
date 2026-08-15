import { describe, expect, it } from "vitest";
import { getWorkerHeartbeatKey, HEARTBEAT_PREFIX } from "@/lib/workflows/worker";
import { getSchedulerHeartbeatKey, SCHEDULER_HEARTBEAT_PREFIX } from "@/lib/schedules/scheduler";

describe("worker and scheduler operability", () => {
  it("uses a unique bounded Redis heartbeat key per instance", () => {
    expect(getWorkerHeartbeatKey("worker-a")).toBe(`${HEARTBEAT_PREFIX}worker-a`);
    expect(getWorkerHeartbeatKey("worker-a")).not.toBe(getWorkerHeartbeatKey("worker-b"));
    expect(getSchedulerHeartbeatKey("scheduler-a")).toBe(`${SCHEDULER_HEARTBEAT_PREFIX}scheduler-a`);
  });
});
