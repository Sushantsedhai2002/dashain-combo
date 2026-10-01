import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  ChannelKind,
  SourceChannel,
  SourceDefinition,
  SourceStatus,
  VerificationEvidence,
} from "@dashain-offer/source-registry";
import { SourceDefinitionSchema } from "../src/schema.js";

const validSource = {
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
};

describe("SourceDefinitionSchema", () => {
  it("accepts only bounded per-source request timeouts", () => {
    expect(
      SourceDefinitionSchema.safeParse({ ...validSource, requestTimeoutMs: 30_000 }).success,
    ).toBe(true);
    for (const requestTimeoutMs of [0, 999, 30_001, 1.5, "30000", null])
      expect(SourceDefinitionSchema.safeParse({ ...validSource, requestTimeoutMs }).success).toBe(
        false,
      );
  });
  it("parses the approved source shape into deeply readonly data", () => {
    const source = SourceDefinitionSchema.parse(validSource);

    expect(source).toEqual(validSource);
    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source.supportedMarkets)).toBe(true);
    expect(Object.isFrozen(source.marketSegments)).toBe(true);
    expect(Object.isFrozen(source.channels)).toBe(true);
    expect(Object.isFrozen(source.channels[0])).toBe(true);
    expect(Object.isFrozen(source.verification)).toBe(true);
  });

  it.each([
    ["an unknown source field", { ...validSource, credentials: "secret" }],
    [
      "an unknown channel field",
      {
        ...validSource,
        channels: [{ ...validSource.channels[0], selector: "#offers" }],
      },
    ],
    [
      "an unknown verification field",
      {
        ...validSource,
        verification: { ...validSource.verification, reviewer: "operator" },
      },
    ],
    [
      "a non-HTTPS channel URL",
      { ...validSource, channels: [{ ...validSource.channels[0], url: "http://example.com" }] },
    ],
    [
      "a channel URL containing credentials",
      {
        ...validSource,
        channels: [
          {
            ...validSource.channels[0],
            url: "https://operator:secret@example.com/offers",
          },
        ],
      },
    ],
    [
      "a non-HTTPS evidence URL",
      {
        ...validSource,
        verification: {
          ...validSource.verification,
          evidenceUrl: "http://example.com/evidence",
        },
      },
    ],
    [
      "a malformed verification date",
      {
        ...validSource,
        verification: { ...validSource.verification, verifiedAt: "29-09-2026" },
      },
    ],
    ["an invalid source ID", { ...validSource, id: "Daraz Nepal" }],
    ["an empty market segment list", { ...validSource, marketSegments: [] }],
    ["an empty market segment", { ...validSource, marketSegments: [""] }],
    ["an unsupported source status", { ...validSource, status: "ENABLED" }],
    [
      "an unsupported channel kind",
      {
        ...validSource,
        channels: [{ ...validSource.channels[0], kind: "YOUTUBE" }],
      },
    ],
    ["an unsupported market", { ...validSource, supportedMarkets: ["IN"] }],
  ])("rejects %s", (_description, input) => {
    expect(SourceDefinitionSchema.safeParse(input).success).toBe(false);
  });

  it("accepts every approved status and channel kind", () => {
    const statuses = ["CANDIDATE", "ACTIVE", "PAUSED", "RETIRED"];
    const kinds = ["WEBSITE", "FACEBOOK", "INSTAGRAM", "TIKTOK"];

    for (const status of statuses) {
      for (const kind of kinds) {
        expect(
          SourceDefinitionSchema.safeParse({
            ...validSource,
            status,
            channels: [{ ...validSource.channels[0], kind }],
          }).success,
        ).toBe(true);
      }
    }
  });
});

describe("public source types", () => {
  it("match the approved readonly semantic contract", () => {
    expectTypeOf<SourceStatus>().toEqualTypeOf<"CANDIDATE" | "ACTIVE" | "PAUSED" | "RETIRED">();
    expectTypeOf<ChannelKind>().toEqualTypeOf<"WEBSITE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK">();
    expectTypeOf<VerificationEvidence>().toEqualTypeOf<
      Readonly<{ verifiedAt: string; evidenceUrl: string }>
    >();
    expectTypeOf<SourceChannel>().toEqualTypeOf<
      Readonly<{ kind: ChannelKind; url: string; isEnabled: boolean }>
    >();
    expectTypeOf<SourceDefinition>().toEqualTypeOf<
      Readonly<{
        id: string;
        displayName: string;
        status: SourceStatus;
        supportedMarkets: readonly ["NP"];
        marketSegments: readonly string[];
        channels: readonly SourceChannel[];
        verification: VerificationEvidence | null;
        requestTimeoutMs?: number | undefined;
        campaignEntryPoints?: readonly string[] | undefined;
        socialPromotionFeeds?: readonly string[] | undefined;
        publicEvidenceFeeds?: readonly string[] | undefined;
        capabilities?:
          readonly ("CAMPAIGN" | "PRODUCT" | "DOCUMENT" | "REVALIDATION")[] | undefined;
      }>
    >();
  });
});

describe("public anonymous JSON evidence registration", () => {
  it("requires bounded distinct credential-free exact URLs on enabled website origins", () => {
    const good = "https://www.daraz.com.np/api/product?id=774";
    expect(
      SourceDefinitionSchema.safeParse({ ...validSource, publicEvidenceFeeds: [good] }).success,
    ).toBe(true);
    for (const publicEvidenceFeeds of [
      [good, good],
      [good + "#fragment"],
      ["https://attacker.test/api/product"],
      ["https://user:password@www.daraz.com.np/api/product"],
      Array.from({ length: 6 }, (_, i) => good + i),
    ])
      expect(
        SourceDefinitionSchema.safeParse({ ...validSource, publicEvidenceFeeds }).success,
      ).toBe(false);
    expect(
      SourceDefinitionSchema.safeParse({
        ...validSource,
        channels: [],
        publicEvidenceFeeds: [good],
      }).success,
    ).toBe(false);
  });
});
