import { describe, expect, it } from "vitest";
import { isReservationActive, reservationExpiry } from "@/lib/concurrency/service";

describe("workspace concurrency reservation lifecycle", () => {
  it("creates an expiry from the current time and bounded lease", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    expect(reservationExpiry(now, 30_000).toISOString()).toBe("2026-08-15T12:00:30.000Z");
  });

  it("treats only unreleased reservations before expiry as active", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    expect(isReservationActive({ expiresAt: new Date("2026-08-15T12:00:01.000Z"), releasedAt: null }, now)).toBe(true);
    expect(isReservationActive({ expiresAt: new Date("2026-08-15T11:59:59.000Z"), releasedAt: null }, now)).toBe(false);
    expect(isReservationActive({ expiresAt: new Date("2026-08-15T12:00:01.000Z"), releasedAt: now }, now)).toBe(false);
  });
});
