import { describe, expect, it } from "vitest";

import * as sourceRegistry from "@dashain-offer/source-registry";

describe("@dashain-offer/source-registry", () => {
  it("resolves through its public entry point", () => {
    expect(Object.keys(sourceRegistry)).toEqual([]);
  });
});
