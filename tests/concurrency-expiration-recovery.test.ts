import { describe, expect, it } from "vitest";
import { canAcquireReservation } from "@/lib/concurrency/service";

describe("workspace concurrency expiration recovery", () => {
  it("allows a new reservation when expired capacity has been reaped", () => {
    expect(canAcquireReservation({ activeCount: 2, expiredCount: 1, limit: 2 })).toBe(true);
  });

  it("rejects acquisition when active reservations still fill the limit", () => {
    expect(canAcquireReservation({ activeCount: 2, expiredCount: 0, limit: 2 })).toBe(false);
  });
});
