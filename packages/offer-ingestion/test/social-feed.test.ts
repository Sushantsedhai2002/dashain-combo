import { describe, expect, it } from "vitest";
import { isCurrentDashainDiscount } from "@dashain-offer/offer-catalog";
import { parsePublishOfferInput } from "../../offer-catalog/src/schema.ts";
import { activeSource } from "../../offer-catalog/test/fixtures/offers.ts";
import {
  createSocialFeedAdapter,
  extractSocialFeed,
  withSocialFeed,
} from "../src/adapters/social-feed.ts";
import { createWebsiteAdapters } from "../src/adapters/websites.ts";
import type { SourceAdapter } from "../src/runner.ts";

const now = "2026-10-01T07:00:00Z";
const feedUrl = "https://www.daraz.com.np/social-promotions.json";
const source = {
  ...activeSource,
  socialPromotionFeeds: [feedUrl],
  channels: [
    ...activeSource.channels,
    { kind: "INSTAGRAM" as const, url: "https://www.instagram.com/daraznp/", isEnabled: true },
  ],
};
const row = {
  socialPost: {
    accountUrl: "https://www.instagram.com/daraznp/",
    url: "https://www.instagram.com/p/ABC123/",
  },
  publishedAt: "2026-09-30T07:00:00Z",
  verifiedAt: now,
  campaign: {
    key: "dashain-2026",
    title: "Dashain 2026",
    festivals: ["DASHAIN"],
    seasonAD: 2026,
    startsAt: null,
    endsAt: null,
  },
  product: {
    key: "washer",
    model: "LG-123",
    variant: "8kg",
    title: "LG washer",
    brand: "LG",
    category: "HOME_APPLIANCES",
    destinationUrl: "https://www.daraz.com.np/washer",
  },
  originalPriceMinor: 6000000,
  salePriceMinor: 5000000,
  availability: "UNKNOWN",
  terms: null,
};
const body = JSON.stringify({ version: 1, offers: [row] });
const extract = (overrides = {}) =>
  extractSocialFeed(
    JSON.stringify({ version: 1, offers: [{ ...row, ...overrides }] }),
    feedUrl,
    source,
    now,
  );
const fetchPage = async () => ({ status: 200, body });

describe("merchant social feeds", () => {
  it("extracts evidenced exact prices and retains publication, verification and attribution", () => {
    const offers = extract()!;
    expect(offers).toHaveLength(1);
    const offer = offers[0]!;
    expect(offer.sourceOfferKey).toBe("dashain-2026:washer");
    expect(offer.discovery?.evidence[0]?.socialPost).toEqual(row.socialPost);
    expect(offer.sourcePublishedAt).toEqual({ kind: "INSTANT", value: row.publishedAt });
    expect(offer.discovery?.priceObservedAt).toBe(now);
    expect(parsePublishOfferInput({ ...offer, source }).ok).toBe(true);
    expect(
      extract({
        campaign: {
          ...row.campaign,
          startsAt: "2026-09-28T00:00:00Z",
          endsAt: "2026-10-20T00:00:00Z",
        },
      })?.[0]?.explicitValidityEnd,
    ).toEqual({ kind: "INSTANT", value: "2026-10-20T00:00:00Z" });
    const wrongIdentity = { ...source, channels: activeSource.channels };
    expect(parsePublishOfferInput({ ...offer, source: wrongIdentity }).ok).toBe(false);
  });
  it("rejects ambiguous prices, identities, dates, duplicate products and malformed payloads", () => {
    for (const overrides of [
      { salePriceMinor: 6000000 },
      { salePriceMinor: -1 },
      { salePriceMinor: "up to 70%" },
      { campaign: { ...row.campaign, festivals: undefined } },
      { campaign: { ...row.campaign, festivals: ["TIHAR"] } },
      { campaign: { ...row.campaign, festivals: [] } },
      { socialPost: { ...row.socialPost, accountUrl: "https://www.instagram.com/other/" } },
      { socialPost: { ...row.socialPost, url: "https://attacker.test/p/ABC/" } },
      { product: { ...row.product, destinationUrl: "https://attacker.test/product" } },
      { publishedAt: "2026-10-02T07:00:00Z" },
      { verifiedAt: "2026-10-02T07:00:00Z" },
      { verifiedAt: "2026-09-29T07:00:00Z" },
      { campaign: { ...row.campaign, startsAt: now, endsAt: now } },
    ])
      expect(extract(overrides)).toBeNull();
    expect(extractSocialFeed("broken", feedUrl, source, now)).toBeNull();
    expect(extractSocialFeed(body, "https://attacker.test/feed", source, now)).toBeNull();
    expect(
      extractSocialFeed(JSON.stringify({ version: 1, offers: [row, row] }), feedUrl, source, now),
    ).toBeNull();
    expect(
      extractSocialFeed(JSON.stringify({ version: 1, offers: [] }), feedUrl, source, now),
    ).toEqual([]);
  });
  it("requires explicit Dashain membership rather than matching festival words in a title", () => {
    for (const title of ["Dashain clearance", "Non-Dashain clearance sale", "Happy holidays"])
      expect(extract({ campaign: { ...row.campaign, title, festivals: undefined } })).toBeNull();
    const offer = extract({ campaign: { ...row.campaign, title: "Festival savings" } })?.[0];
    expect(offer?.discovery?.campaign?.festivals).toEqual(["DASHAIN"]);
  });
  it("does not refresh old price verification just because a feed was fetched again", async () => {
    const { discountedProduct } =
      await import("../../offer-catalog/test/fixtures/discounted-product.ts");
    const offer = extract({ verifiedAt: row.publishedAt })![0]!;
    expect(offer.discovery?.priceObservedAt).toBe(row.publishedAt);
    expect(
      isCurrentDashainDiscount(
        { ...discountedProduct, ...offer },
        new Date("2026-10-03T07:00:00Z"),
      ),
    ).toBe(false);
  });
  it("fails closed on access errors and changed feed contracts", async () => {
    const adapter = createSocialFeedAdapter(source.id, fetchPage, () => new Date(now));
    expect(await adapter.scan(source)).toMatchObject({
      ok: true,
      authoritative: true,
      offers: [{ sourceOfferKey: "dashain-2026:washer" }],
    });
    expect(await adapter.scan(activeSource)).toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
    expect(
      await createSocialFeedAdapter(source.id, async () => ({ status: 403, body: "" })).scan(
        source,
      ),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createSocialFeedAdapter(source.id, async () => {
        throw new Error("timeout");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createSocialFeedAdapter(source.id, async () => ({ status: 200, body: "{}" })).scan(
        source,
      ),
    ).toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
  it("merges collection channels without withdrawing offers on partial failure", async () => {
    const offers = extract()!;
    const website: SourceAdapter = {
      sourceId: source.id,
      scan: async () => ({ ok: true, offers, authoritative: true }),
    };
    const merged = withSocialFeed(website, fetchPage);
    expect(await merged.scan(source)).toMatchObject({
      ok: true,
      offers: [{ sourceOfferKey: offers[0]!.sourceOfferKey }],
      authoritative: true,
      partial: false,
    });
    expect(await merged.scan(activeSource)).toMatchObject({ ok: true });
    expect(
      await withSocialFeed(website, async () => ({ status: 403, body: "" })).scan(source),
    ).toMatchObject({ ok: true, partial: true, authoritative: false });
    expect(
      await withSocialFeed(
        { ...website, scan: async () => ({ ok: false, reason: "NETWORK_ERROR" }) },
        fetchPage,
      ).scan(source),
    ).toMatchObject({ ok: true, partial: true });
    expect(
      await withSocialFeed(
        { ...website, scan: async () => ({ ok: false, reason: "NETWORK_ERROR" }) },
        async () => ({ status: 403, body: "" }),
      ).scan(source),
    ).toMatchObject({ ok: false });
    expect(
      await withSocialFeed(
        {
          ...website,
          scan: async () => ({
            ok: true,
            offers: [{ ...offers[0]!, salePrice: { currency: "NPR", amountMinor: 1 } }],
          }),
        },
        fetchPage,
      ).scan(source),
    ).toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
    const adapters = createWebsiteAdapters(fetchPage, [{ ...source, id: "feed-only-merchant" }]);
    expect(
      await adapters
        .find((a) => a.sourceId === "feed-only-merchant")!
        .scan({ ...source, id: "feed-only-merchant" }),
    ).toMatchObject({ ok: true });
  });
});
