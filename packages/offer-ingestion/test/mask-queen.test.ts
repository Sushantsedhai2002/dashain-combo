import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  MASK_CAMPAIGN,
  MASK_COLLECTION,
  createMaskQueenAdapter,
  maskCampaign,
  maskMembers,
  extractMaskVariants,
} from "../src/adapters/mask-queen.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "mask-queen-nepal")!;
const fixturePages: Readonly<Record<string, string>> = pages;
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${fixturePages[url]}`, import.meta.url), "utf8"),
});
const now = "2026-10-01T07:00:00Z",
  campaign = (await fetch(MASK_CAMPAIGN)).body,
  collection = (await fetch(MASK_COLLECTION)).body,
  member = maskMembers(collection)![1]!,
  html = (await fetch(member.url)).body;
describe("Mask Queen dated exact variant pilot", () => {
  it("publishes 61 available exact variants from eight uniformly priced first-page products", async () => {
    const urls: string[] = [];
    const r = await createMaskQueenAdapter(
      async (url) => {
        urls.push(url);
        return fetch(url);
      },
      () => new Date(now),
    ).scan(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offers).toHaveLength(61);
    expect(urls).toHaveLength(10);
    expect(r.partial).toBe(true);
    for (const o of r.offers) {
      expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
      expect(o.discovery?.availability).toBe("IN_STOCK");
      expect(o.destinationUrl).toMatch(/\?variant=\d+$/);
    }
    const variants = extractMaskVariants(campaign, html, member, now)!;
    expect(variants).toHaveLength(3);
    expect(variants.map((o) => o.discovery?.product?.variant)).toEqual([
      "White-15PC",
      "Rose Pink-15PC",
      "Black-15PC",
    ]);
    expect(variants[0]).toMatchObject({
      originalPrice: { amountMinor: 25000 },
      salePrice: { amountMinor: 15000 },
      discovery: {
        campaign: { startsAt: "2026-09-14T18:15:00.000Z", endsAt: "2026-10-10T18:14:59.999Z" },
      },
    });
  });
  it("rejects inactive seasons, unsafe membership, price disagreement and contradictory stock/options", () => {
    expect(maskCampaign(campaign, "2026-09-01T00:00:00Z")).toBeNull();
    expect(maskCampaign(campaign, "2026-10-11T00:00:00Z")).toBeNull();
    expect(maskCampaign(campaign, "2027-10-01T00:00:00Z")).toBeNull();
    expect(maskCampaign("", now)).toBeNull();
    expect(maskMembers("")).toBeNull();
    const withoutBadge = load(collection);
    withoutBadge("#product-grid > li")
      .filter((_i, element) => withoutBadge(element).find("h3.h5 a").text().trim() === member.title)
      .find(".badge")
      .remove();
    expect(maskMembers(withoutBadge.html())).toHaveLength(7);
    expect(
      maskMembers(
        collection.replaceAll('href="/products/', 'href="https://attacker.test/products/'),
      ),
    ).toBeNull();
    expect(extractMaskVariants("", html, member, now)).toBeNull();
    expect(extractMaskVariants(campaign, "", member, now)).toBeNull();
    expect(
      extractMaskVariants(campaign, html.replaceAll("Rs150.00", "Rs151.00"), member, now),
    ).toBeNull();
    for (const mutate of [
      (v: Record<string, unknown>[]) => {
        v[0]!.price = 15100;
      },
      (v: Record<string, unknown>[]) => {
        v[0]!.available = false;
      },
      (v: Record<string, unknown>[]) => {
        v[0]!.id = v[1]!.id;
      },
      (v: Record<string, unknown>[]) => {
        v[0]!.title = "unknown choice";
      },
      (v: Record<string, unknown>[]) => {
        v[0]!.requires_selling_plan = true;
      },
    ]) {
      const $ = load(html),
        script = $('variant-selects script[type="application/json"]'),
        v = JSON.parse(script.text());
      mutate(v);
      script.text(JSON.stringify(v));
      expect(extractMaskVariants(campaign, $.html(), member, now)).toBeNull();
    }
    const $ = load(html);
    $('variant-selects script[type="application/json"]').text("{");
    expect(extractMaskVariants(campaign, $.html(), member, now)).toBeNull();
    const other = load(html);
    other("variant-selects input").first().attr("value", "missing");
    expect(extractMaskVariants(campaign, other.html(), member, now)).toBeNull();
    expect(
      extractMaskVariants(
        campaign,
        html.replaceAll('"priceCurrency" : "NPR"', '"priceCurrency" : "USD"'),
        member,
        now,
      ),
    ).toBeNull();
  });
  it("fails interrupted requests and changed layouts without making removal claims", async () => {
    expect(await createMaskQueenAdapter(fetch).scan({ ...source, id: "other" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createMaskQueenAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMaskQueenAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMaskQueenAdapter(
        async () => ({ status: 200, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createMaskQueenAdapter(
        async (url) => (url.includes("/products/") ? { status: 503, body: "" } : fetch(url)),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMaskQueenAdapter(
        async (url) => (url.includes("/products/") ? { status: 200, body: "" } : fetch(url)),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
});
