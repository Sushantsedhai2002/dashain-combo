import { describe, expect, expectTypeOf, it } from "vitest";

import {
  parseSourceRegistry,
  type RegistryIssue,
  type RegistryResult,
} from "@dashain-offer/source-registry";

function source(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "daraz-nepal",
    displayName: "Daraz Nepal",
    status: "ACTIVE",
    supportedMarkets: ["NP"],
    marketSegments: ["general-retail"],
    channels: [
      {
        kind: "WEBSITE",
        url: "https://www.daraz.com.np/",
        isEnabled: true,
      },
    ],
    verification: {
      verifiedAt: "2026-09-29T12:00:00.000Z",
      evidenceUrl: "https://www.daraz.com.np/about-us/",
    },
    ...overrides,
  };
}

describe("parseSourceRegistry", () => {
  it("returns all valid sources without rewriting configured values", () => {
    const input = [
      source(),
      source({
        id: "paused-store",
        displayName: "Paused Store",
        status: "PAUSED",
        channels: [{ kind: "WEBSITE", url: "https://paused.example.com/", isEnabled: false }],
        verification: null,
      }),
    ];

    const result = parseSourceRegistry(input);

    expect(result).toEqual({ ok: true, sources: input });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.sources)).toBe(true);
      expect(Object.isFrozen(result.sources[0])).toBe(true);
    }
  });

  it("returns every schema issue in deterministic natural path order", () => {
    const inputs = Array.from({ length: 11 }, (_, index) =>
      source({ id: `source-${index}`, status: "PAUSED" }),
    );
    inputs[2] = source({ id: "Invalid ID", status: "UNKNOWN" });
    inputs[10] = source({ id: "source-10", marketSegments: [], unexpected: true });

    const result = parseSourceRegistry(inputs);

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "INVALID_SCHEMA",
          path: "$[2].id",
          message: 'Registry value at "$[2].id" does not match the source schema.',
          sourceId: "Invalid ID",
        },
        {
          code: "INVALID_SCHEMA",
          path: "$[2].status",
          message: 'Registry value at "$[2].status" does not match the source schema.',
          sourceId: "Invalid ID",
        },
        {
          code: "INVALID_SCHEMA",
          path: "$[10].marketSegments",
          message: 'Registry value at "$[10].marketSegments" does not match the source schema.',
          sourceId: "source-10",
        },
        {
          code: "INVALID_SCHEMA",
          path: "$[10].unexpected",
          message: 'Registry value at "$[10].unexpected" does not match the source schema.',
          sourceId: "source-10",
        },
      ],
    });
  });

  it("returns no partial source data when any record is invalid", () => {
    const result = parseSourceRegistry([source(), source({ id: "not valid" })]);

    expect(result.ok).toBe(false);
    expect("sources" in result).toBe(false);
  });

  it("reports every unmet active-source requirement", () => {
    const result = parseSourceRegistry([
      source({
        channels: [
          {
            kind: "WEBSITE",
            url: "https://www.daraz.com.np/",
            isEnabled: false,
          },
        ],
        verification: null,
      }),
    ]);

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "ACTIVE_SOURCE_WITHOUT_CHANNEL",
          path: "$[0].channels",
          message: "Active source must have at least one enabled channel.",
          sourceId: "daraz-nepal",
        },
        {
          code: "ACTIVE_SOURCE_NOT_VERIFIED",
          path: "$[0].verification",
          message: "Active source must include verification evidence.",
          sourceId: "daraz-nepal",
        },
      ],
    });
    if (!result.ok) {
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.issues)).toBe(true);
      expect(result.issues.every(Object.isFrozen)).toBe(true);
    }
  });

  it("allows inactive sources without verification or enabled channels", () => {
    const result = parseSourceRegistry([
      source({ status: "CANDIDATE", channels: [], verification: null }),
    ]);

    expect(result.ok).toBe(true);
  });

  it("normalizes a non-array input without exposing Zod errors", () => {
    const result = parseSourceRegistry({ sources: [] });

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "INVALID_SCHEMA",
          path: "$",
          message: 'Registry value at "$" does not match the source schema.',
        },
      ],
    });
    if (!result.ok) {
      expect(Object.keys(result.issues[0] ?? {})).toEqual(["code", "path", "message"]);
    }
  });

  it("rejects repeated source IDs at every later occurrence", () => {
    const result = parseSourceRegistry([
      source(),
      source({
        displayName: "Duplicate Daraz",
        channels: [{ kind: "WEBSITE", url: "https://duplicate.example.com/", isEnabled: true }],
      }),
      source({
        displayName: "Another Duplicate Daraz",
        channels: [{ kind: "WEBSITE", url: "https://another.example.com/", isEnabled: true }],
      }),
    ]);

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "DUPLICATE_SOURCE_ID",
          path: "$[1].id",
          message: 'Source ID duplicates the value first declared at "$[0].id".',
          sourceId: "daraz-nepal",
        },
        {
          code: "DUPLICATE_SOURCE_ID",
          path: "$[2].id",
          message: 'Source ID duplicates the value first declared at "$[0].id".',
          sourceId: "daraz-nepal",
        },
      ],
    });
  });

  it("rejects repeated canonical channel URLs without rewriting originals", () => {
    const firstUrl = "https://SOCIAL.example.com/daraz-nepal/";
    const repeatedUrl = "https://social.example.com:443/daraz-nepal#offers";
    const result = parseSourceRegistry([
      source({
        channels: [{ kind: "FACEBOOK", url: firstUrl, isEnabled: true }],
      }),
      source({
        id: "another-store",
        displayName: "Another Store",
        channels: [{ kind: "FACEBOOK", url: repeatedUrl, isEnabled: true }],
      }),
    ]);

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "DUPLICATE_CHANNEL_URL",
          path: "$[1].channels[0].url",
          message: 'Channel URL duplicates the value first declared at "$[0].channels[0].url".',
          sourceId: "another-store",
        },
      ],
    });
    expect(firstUrl).toBe("https://SOCIAL.example.com/daraz-nepal/");
    expect(repeatedUrl).toBe("https://social.example.com:443/daraz-nepal#offers");
  });

  it("does not collapse distinct channel paths or accounts", () => {
    const firstUrl = "https://social.example.com/brand-one";
    const secondUrl = "https://social.example.com/brand-two";
    const input = [
      source({ channels: [{ kind: "FACEBOOK", url: firstUrl, isEnabled: true }] }),
      source({
        id: "brand-two",
        displayName: "Brand Two",
        channels: [{ kind: "FACEBOOK", url: secondUrl, isEnabled: true }],
      }),
    ];

    expect(parseSourceRegistry(input)).toEqual({ ok: true, sources: input });
  });

  it("matches the documented result and issue types", () => {
    expectTypeOf<RegistryIssue>().toMatchTypeOf<
      Readonly<{
        code:
          | "INVALID_SCHEMA"
          | "DUPLICATE_SOURCE_ID"
          | "DUPLICATE_CHANNEL_URL"
          | "ACTIVE_SOURCE_NOT_VERIFIED"
          | "ACTIVE_SOURCE_WITHOUT_CHANNEL";
        path: string;
        message: string;
        sourceId?: string;
      }>
    >();
    expectTypeOf(parseSourceRegistry).returns.toEqualTypeOf<RegistryResult>();
  });
});
