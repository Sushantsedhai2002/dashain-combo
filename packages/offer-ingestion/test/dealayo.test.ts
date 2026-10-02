import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  createDealayoAdapter,
  DEALAYO_CAMPAIGN,
  extractDealayoPage,
} from "../src/adapters/dealayo.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "dealayo")!;
const fixturePages: Readonly<Record<string, string>> = pages;
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${fixturePages[url]}`, import.meta.url), "utf8"),
});
const now = "2026-10-01T07:00:00Z",
  html = (await fetch(DEALAYO_CAMPAIGN)).body;
describe("Dealayo current-season collection", () => {
  it("checks all 387 members on 17 pages, publishing 324 discounted exact products", async () => {
    const urls: string[] = [];
    const r = await createDealayoAdapter(
      async (url) => {
        urls.push(url);
        return fetch(url);
      },
      () => new Date(now),
    ).scan(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(urls).toHaveLength(17);
    expect(r.offers).toHaveLength(324);
    expect(r.offers.every((offer) => offer.imageUrl?.startsWith("https://dealayo.com/"))).toBe(
      true,
    );
    expect(r.partial).toBe(true);
    for (const o of r.offers) expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
    expect(r.offers[0]).toMatchObject({
      originalPrice: { amountMinor: 2469000 },
      salePrice: { amountMinor: 1979000 },
      discovery: {
        campaign: { seasonBS: "2083", startsAt: null, endsAt: null },
        availability: "UNKNOWN",
      },
    });
  });
  it("rejects stale headings, changed totals/pagination, unsafe destinations, duplicate IDs and inconsistent prices", () => {
    expect(extractDealayoPage(html, DEALAYO_CAMPAIGN, "2027-10-01T07:00:00Z")).toBeNull();
    for (const changed of [
      "",
      html.replaceAll("Dashain Offer 2083", "Dashain Offer 2082"),
      html.replace("Items <span", "Products <span"),
      html.replaceAll(">387<", ">1001<"),
      html.replaceAll("?p=2", "?p=1"),
      html.replaceAll(
        'href="https://dealayo.com/cg-100-liter',
        'href="https://attacker.test/cg-100-liter',
      ),
      html.replaceAll('data-product-id="76243"', 'data-product-id="76244"'),
      html.replaceAll('data-price-amount="19790"', 'data-price-amount="19791"'),
      html.replaceAll('data-price-amount="24690"', 'data-price-amount="24691"'),
      html.replaceAll("NPR 19,790.00", "NPR 0.00"),
      html.replaceAll("NPR 24,690.00", "NPR 1.00"),
    ])
      expect(
        extractDealayoPage(changed, DEALAYO_CAMPAIGN, now),
        `mutation ${changed.slice(0, 10)}; unchanged: ${changed === html}`,
      ).toBeNull();
    expect(extractDealayoPage(html, DEALAYO_CAMPAIGN + "?p=x", now)).toBeNull();
    const variant = html.replace(
      'name="product"\n                                                   value="76244"',
      'name="super_attribute[1]"\n                                                   value="76244"',
    );
    expect(
      extractDealayoPage(variant, DEALAYO_CAMPAIGN, now)?.offers.some((o) =>
        o.sourceOfferKey.endsWith(":76244"),
      ),
    ).toBe(false);
  });
  it("fails incomplete scans and does not infer authoritative removals", async () => {
    expect(await createDealayoAdapter(fetch).scan({ ...source, id: "other" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createDealayoAdapter(fetch).scan({ ...source, campaignEntryPoints: [] }),
    ).toMatchObject({ ok: false, reason: "UNSUPPORTED_SOURCE" });
    expect(
      await createDealayoAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createDealayoAdapter(async () => ({ status: 503, body: html })).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createDealayoAdapter(
        async () => ({ status: 200, body: html }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createDealayoAdapter(
        async (url) => {
          const r = await fetch(url);
          return { ...r, body: url.includes("p=2") ? r.body.replaceAll(">387<", ">388<") : r.body };
        },
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
});
