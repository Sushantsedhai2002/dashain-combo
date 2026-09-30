import { describe, expect, it } from "vitest";

import {
  calculateExpiry,
  deriveLifecycleStatus,
} from "../src/lifecycle.ts";

const discoveredAt = new Date("2026-09-01T06:00:00.000Z");

describe("calculateExpiry", () => {
  it("uses an explicit instant without changing it", () => {
    const expiry = calculateExpiry({
      explicitValidityEnd: {
        kind: "INSTANT",
        value: "2026-09-18T12:34:56+05:45",
      },
      sourcePublishedAt: {
        kind: "INSTANT",
        value: "2026-09-01T00:00:00Z",
      },
      firstDiscoveredAt: discoveredAt,
    });

    expect(expiry.toISOString()).toBe("2026-09-18T06:49:56.000Z");
  });

  it("expires after the full explicit Kathmandu date", () => {
    const expiry = calculateExpiry({
      explicitValidityEnd: {
        kind: "KATHMANDU_DATE",
        value: "2026-10-05",
      },
      sourcePublishedAt: null,
      firstDiscoveredAt: discoveredAt,
    });

    expect(expiry.toISOString()).toBe("2026-10-05T18:15:00.000Z");
  });

  it("adds exactly twenty days to a source publication instant", () => {
    const expiry = calculateExpiry({
      explicitValidityEnd: null,
      sourcePublishedAt: {
        kind: "INSTANT",
        value: "2026-09-03T12:00:00.000Z",
      },
      firstDiscoveredAt: discoveredAt,
    });

    expect(expiry.toISOString()).toBe("2026-09-23T12:00:00.000Z");
  });

  it("starts a source publication date at Kathmandu midnight", () => {
    const expiry = calculateExpiry({
      explicitValidityEnd: null,
      sourcePublishedAt: {
        kind: "KATHMANDU_DATE",
        value: "2026-09-03",
      },
      firstDiscoveredAt: discoveredAt,
    });

    expect(expiry.toISOString()).toBe("2026-09-22T18:15:00.000Z");
  });

  it("falls back to twenty days after first discovery", () => {
    const expiry = calculateExpiry({
      explicitValidityEnd: null,
      sourcePublishedAt: null,
      firstDiscoveredAt: discoveredAt,
    });

    expect(expiry.toISOString()).toBe("2026-09-21T06:00:00.000Z");
  });

  it("does not let source publication override explicit validity", () => {
    const expiry = calculateExpiry({
      explicitValidityEnd: {
        kind: "KATHMANDU_DATE",
        value: "2026-09-10",
      },
      sourcePublishedAt: {
        kind: "INSTANT",
        value: "2026-09-09T00:00:00Z",
      },
      firstDiscoveredAt: discoveredAt,
    });

    expect(expiry.toISOString()).toBe("2026-09-10T18:15:00.000Z");
  });
});

describe("deriveLifecycleStatus", () => {
  it("prioritizes withdrawal over every time boundary", () => {
    expect(
      deriveLifecycleStatus({
        now: new Date("2026-09-05T00:00:00Z"),
        validityStartsAt: "2026-09-10T00:00:00Z",
        expiresAt: "2026-09-20T00:00:00Z",
        withdrawnAt: "2026-09-04T00:00:00Z",
      }),
    ).toBe("WITHDRAWN");
  });

  it("is scheduled before its start instant", () => {
    expect(
      deriveLifecycleStatus({
        now: new Date("2026-09-09T23:59:59.999Z"),
        validityStartsAt: "2026-09-10T00:00:00Z",
        expiresAt: "2026-09-20T00:00:00Z",
        withdrawnAt: null,
      }),
    ).toBe("SCHEDULED");
  });

  it("is active immediately before expiry", () => {
    expect(
      deriveLifecycleStatus({
        now: new Date("2026-09-19T23:59:59.999Z"),
        validityStartsAt: null,
        expiresAt: "2026-09-20T00:00:00Z",
        withdrawnAt: null,
      }),
    ).toBe("ACTIVE");
  });

  it("is expired at the exact expiry instant", () => {
    expect(
      deriveLifecycleStatus({
        now: new Date("2026-09-20T00:00:00Z"),
        validityStartsAt: null,
        expiresAt: "2026-09-20T00:00:00Z",
        withdrawnAt: null,
      }),
    ).toBe("EXPIRED");
  });
});
