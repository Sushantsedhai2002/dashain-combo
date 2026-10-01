import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  MAAKE_ROOT,
  maakeCampaign,
  maakeMembers,
  extractMaake,
  createMaakeAdapter,
} from "../src/adapters/maake.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "maake-beauty-nepal")!;
const fixturePages: Readonly<Record<string, string>> = pages;
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${fixturePages[url]}`, import.meta.url), "utf8"),
});
const now = "2026-10-01T07:00:00Z",
  root = (await fetch(MAAKE_ROOT)).body,
  member = maakeMembers(root)![0]!,
  html = (await fetch(member.url)).body;
describe("Maake observed product prices with conditional campaign coupon", () => {
  it("publishes three simple exact products while retaining coupon conditions separately", async () => {
    const urls: string[] = [];
    const r = await createMaakeAdapter(
      async (url) => {
        urls.push(url);
        return fetch(url);
      },
      () => new Date(now),
    ).scan(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offers).toHaveLength(3);
    expect(urls).toHaveLength(4);
    expect(r.partial).toBe(true);
    for (const o of r.offers) {
      expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
      expect(o.discovery?.offerType).toBe("PRODUCT_DISCOUNT");
      expect(o.discovery?.benefits[0]).toMatchObject({
        type: "COUPON",
        percent: 10,
        status: "CONDITIONAL",
      });
    }
    expect(r.offers[0]).toMatchObject({
      salePrice: { amountMinor: 32900 },
      originalPrice: { amountMinor: 42900 },
      discovery: {
        eligibility: { minimumSpendMinor: null, coupon: null, combinability: "UNKNOWN" },
        campaign: { endsAt: "2026-11-12T06:16:00.000Z" },
      },
    });
    expect(r.offers[0]?.terms).toContain("at least NPR 500");
  });
  it("rejects undated/stale promotions, unsafe members, variant uncertainty, stock and conflicting prices", () => {
    expect(maakeCampaign(root, "2027-10-01T00:00:00Z")).toBeNull();
    expect(maakeCampaign(root, "2026-11-13T00:00:00Z")).toBeNull();
    expect(maakeCampaign("", now)).toBeNull();
    expect(
      maakeCampaign(root.replaceAll("2026-11-12T12:01:00+05:45", "yesterday"), now),
    ).toBeNull();
    expect(maakeMembers("")).toBeNull();
    expect(
      maakeMembers(
        root.replaceAll(
          'href="https://maakebeautynepal.com/product/',
          'href="https://attacker.test/product/',
        ),
      ),
    ).toBeNull();
    expect(extractMaake("", html, member, now)).toBeNull();
    expect(extractMaake(root, "", member, now)).toBeNull();
    for (const changed of [
      html.replaceAll("Rs. 329.00", "Rs. 328.00"),
      html.replaceAll("Rs. 429.00", "Rs. 428.00"),
      html.replaceAll("DASHAIN10", "UNKNOWN"),
      html.replaceAll("500.00", "501.00"),
      html.replaceAll("addToCartFromBtn(27,", "addToCartFromBtn(28,"),
    ])
      expect(extractMaake(root, changed, member, now)).toBeNull();
    for (const config of [
      { base_stock: 0, attributes: [], variations: [] },
      { base_stock: 1000, attributes: ["color"], variations: [] },
      { base_stock: 1000, attributes: [], variations: [{ id: 1 }] },
    ]) {
      const $ = load(html),
        node = $("[x-data]").filter((i, e) =>
          ($(e).attr("x-data") ?? "").startsWith("productPage("),
        );
      node.attr("x-data", `productPage([], ${JSON.stringify(config)})`);
      expect(extractMaake(root, $.html(), member, now)).toBeNull();
    }
    const $ = load(html);
    $("[x-data]")
      .filter((i, e) => ($(e).attr("x-data") ?? "").startsWith("productPage("))
      .attr("x-data", "productPage(alert(1), {})");
    expect(extractMaake(root, $.html(), member, now)).toBeNull();
  });
  it("fails incomplete requests and marks the homepage subset partial", async () => {
    expect(await createMaakeAdapter(fetch).scan({ ...source, id: "other" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createMaakeAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMaakeAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMaakeAdapter(
        async () => ({ status: 200, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createMaakeAdapter(
        async (url) => (url === MAAKE_ROOT ? fetch(url) : { status: 503, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMaakeAdapter(
        async (url) => (url === MAAKE_ROOT ? fetch(url) : { status: 200, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
});
