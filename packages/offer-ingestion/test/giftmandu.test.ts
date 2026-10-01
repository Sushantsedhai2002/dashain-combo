import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  GIFTMANDU_ROOT,
  GIFTMANDU_COLLECTION,
  giftmanduCampaign,
  giftmanduMembers,
  extractGiftmandu,
  createGiftmanduAdapter,
} from "../src/adapters/giftmandu.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "giftmandu")!;
const fixturePages: Readonly<Record<string, string>> = pages;
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${fixturePages[url]}`, import.meta.url), "utf8"),
});
const now = "2026-10-01T07:00:00Z",
  root = (await fetch(GIFTMANDU_ROOT)).body,
  collection = (await fetch(GIFTMANDU_COLLECTION)).body,
  member = giftmanduMembers(collection)![0]!,
  html = (await fetch(member.url)).body;
describe("Giftmandu dated scene and explicitly discounted Dashain collection", () => {
  it("publishes only observed discounted simple decor products, with corroborated stock and prices", async () => {
    const urls: string[] = [];
    const r = await createGiftmanduAdapter(
      async (url) => {
        urls.push(url);
        return fetch(url);
      },
      () => new Date(now),
    ).scan(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offers).toHaveLength(4);
    expect(urls).toHaveLength(6);
    expect(r.partial).toBe(true);
    expect(urls.every((u) => !u.includes("cart.php"))).toBe(true);
    for (const o of r.offers) {
      expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
      expect(o.discovery?.availability).toBe("IN_STOCK");
    }
    expect(r.offers[0]).toMatchObject({
      salePrice: { amountMinor: 72200 },
      originalPrice: { amountMinor: 85000 },
      discovery: {
        product: { model: "SP-10657", attributes: { sku: "SP-10657" } },
        campaign: { startsAt: "2026-09-26T18:15:00.000Z", endsAt: "2026-10-16T18:14:59.999Z" },
      },
    });
    expect(r.offers[0]?.terms).toContain("not applied");
  });
  it("rejects stale/undated seasons, unresolved options, stock conflicts and price mismatches", () => {
    for (const date of [
      "2026-09-20T00:00:00Z",
      "2026-10-17T00:00:00Z",
      "2027-10-01T00:00:00Z",
      "invalid",
    ])
      expect(giftmanduCampaign(root, date)).toBeNull();
    expect(
      giftmanduCampaign(root.replaceAll("Dashain Gifts 2083", "Dashain Gifts"), now),
    ).toBeNull();
    expect(
      giftmanduCampaign(root.replaceAll("start:NPT(2026, 9, 27)", "start:NPT(2025, 9, 27)"), now),
    ).toBeNull();
    expect(giftmanduCampaign("", now)).toBeNull();
    expect(giftmanduMembers("")).toBeNull();
    expect(
      giftmanduMembers(
        collection.replaceAll(
          'href="https://www.giftmandu.com/golden-lord-ganesha-statue"',
          'href="https://attacker.test/product"',
        ),
      ),
    ).toBeNull();
    for (const changed of [
      html.replaceAll('"instock":true', '"instock":false'),
      html.replaceAll('"purchasable":true', '"purchasable":false'),
      html.replaceAll('"value":722', '"value":721'),
      html.replaceAll('"sku":"SP-10657"', '"sku":"OTHER"'),
      html.replaceAll('"price": "722"', '"price": "721"'),
      html.replaceAll("https://schema.org/InStock", "https://schema.org/OutOfStock"),
    ])
      expect(extractGiftmandu(root, collection, changed, member, now)).toBeNull();
    const $ = load(html);
    $(".productView")
      .first()
      .find("[data-product-option-change]")
      .append('<select name="attribute[color]"><option>Unselected</option></select>');
    expect(extractGiftmandu(root, collection, $.html(), member, now)).toBeNull();
    expect(extractGiftmandu(root, collection, "", member, now)).toBeNull();
  }, 15_000);
  it("fails incomplete refreshes and never treats a first-page subset as a full scan", async () => {
    expect(await createGiftmanduAdapter(fetch).scan({ ...source, id: "other" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createGiftmanduAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createGiftmanduAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createGiftmanduAdapter(
        async () => ({ status: 200, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createGiftmanduAdapter(
        async (url) => (url === member.url ? { status: 503, body: "" } : fetch(url)),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createGiftmanduAdapter(
        async (url) =>
          url === GIFTMANDU_ROOT || url === GIFTMANDU_COLLECTION
            ? fetch(url)
            : { status: 200, body: "" },
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
});
