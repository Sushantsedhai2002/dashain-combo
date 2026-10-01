import { expect, it } from "vitest";
import {
  isRegisteredSocialPost,
  parseSourceRegistry,
  type SourceDefinition,
} from "../src/index.ts";
const source: SourceDefinition = {
  id: "merchant",
  displayName: "Merchant",
  status: "ACTIVE",
  supportedMarkets: ["NP"],
  marketSegments: ["retail"],
  channels: [
    { kind: "WEBSITE", url: "https://merchant.test/", isEnabled: true },
    { kind: "FACEBOOK", url: "https://www.facebook.com/merchant", isEnabled: true },
    { kind: "INSTAGRAM", url: "https://www.instagram.com/merchant/", isEnabled: true },
    { kind: "TIKTOK", url: "https://www.tiktok.com/@merchant", isEnabled: true },
  ],
  verification: { verifiedAt: "2026-10-01T00:00:00Z", evidenceUrl: "https://merchant.test/about" },
};
it("matches exact enabled social identities and valid platform post paths", () => {
  expect(
    isRegisteredSocialPost(
      source,
      "https://www.instagram.com/merchant",
      "https://www.instagram.com/p/ABC_123/",
    ),
  ).toBe(true);
  expect(
    isRegisteredSocialPost(
      source,
      "https://www.facebook.com/merchant",
      "https://www.facebook.com/merchant/posts/123",
    ),
  ).toBe(true);
  expect(
    isRegisteredSocialPost(
      source,
      "https://www.facebook.com/merchant",
      "https://www.facebook.com/merchant/videos/123",
    ),
  ).toBe(true);
  expect(
    isRegisteredSocialPost(
      source,
      "https://www.tiktok.com/@merchant",
      "https://www.tiktok.com/@merchant/video/123",
    ),
  ).toBe(true);
  for (const post of [
    "https://www.facebook.com/other/posts/123",
    "https://www.facebook.com/merchant-evil/posts/123",
    "https://www.facebook.com/merchant",
    "https://www.facebook.com:444/merchant/posts/123",
    "https://user@www.facebook.com/merchant/posts/123",
    "javascript:alert(1)",
  ])
    expect(isRegisteredSocialPost(source, "https://www.facebook.com/merchant", post)).toBe(false);
  expect(
    isRegisteredSocialPost(
      source,
      "https://www.instagram.com/other",
      "https://www.instagram.com/p/ABC/",
    ),
  ).toBe(false);
  expect(
    isRegisteredSocialPost(
      source,
      "https://www.instagram.com/merchant/",
      "https://www.instagram.com/merchant/",
    ),
  ).toBe(false);
  expect(
    isRegisteredSocialPost(
      source,
      "https://www.tiktok.com/@merchant",
      "https://www.tiktok.com/@other/video/123",
    ),
  ).toBe(false);
  expect(
    isRegisteredSocialPost(
      { ...source, channels: source.channels.map((c) => ({ ...c, isEnabled: false })) },
      "https://www.instagram.com/merchant/",
      "https://www.instagram.com/p/ABC/",
    ),
  ).toBe(false);
});
it("permits merchant feeds only on an approved website origin", () => {
  expect(
    parseSourceRegistry([
      { ...source, socialPromotionFeeds: ["https://merchant.test/promotions.json"] },
    ]).ok,
  ).toBe(true);
  expect(
    parseSourceRegistry([
      { ...source, socialPromotionFeeds: ["https://attacker.test/promotions.json"] },
    ]).ok,
  ).toBe(false);
});
