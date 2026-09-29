import { describe, expect, expectTypeOf, it } from "vitest";

import {
  getActiveSources,
  type SourceDefinition,
  type SourceStatus,
} from "@dashain-offer/source-registry";

function source(id: string, status: SourceStatus): SourceDefinition {
  return {
    id,
    displayName: id,
    status,
    supportedMarkets: ["NP"],
    marketSegments: ["general-retail"],
    channels: [
      {
        kind: "WEBSITE",
        url: `https://${id}.example.com/`,
        isEnabled: true,
      },
    ],
    verification: null,
  };
}

describe("getActiveSources", () => {
  it("returns only active sources in registry order", () => {
    const firstActive = source("first-active", "ACTIVE");
    const paused = source("paused", "PAUSED");
    const secondActive = source("second-active", "ACTIVE");
    const input = [firstActive, paused, secondActive];

    const result = getActiveSources(input);

    expect(result).toEqual([firstActive, secondActive]);
    expect(result[0]).toBe(firstActive);
    expect(result[1]).toBe(secondActive);
  });

  it("returns a frozen readonly array without mutating its input", () => {
    const input = [source("candidate", "CANDIDATE"), source("active", "ACTIVE")];
    const snapshot = [...input];

    const result = getActiveSources(input);

    expect(input).toEqual(snapshot);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expectTypeOf(result).toEqualTypeOf<readonly SourceDefinition[]>();
  });
});
